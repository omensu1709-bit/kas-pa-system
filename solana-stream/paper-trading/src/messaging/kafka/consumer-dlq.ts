/**
 * KAS PA - Kafka Dead Letter Queue Consumer
 * Erweitert den Standard Consumer um DLQ-Funktionalität
 */

import { Kafka, Consumer, Producer, EachMessagePayload, logLevel } from 'kafkajs';
import { KASPAEvent, CrashSignalEvent, TradeEvent, TelemetryEvent } from './producer.js';

export interface DLQConfig {
  /** Topic-Prefix für DLQ (z.B. 'kaspa.crash-signals.dlq') */
  topicPrefix: string;
  /** Maximale Retry-Versuche bevor DLQ */
  maxRetries: number;
  /** Retry-Delay in ms */
  retryDelayMs: number;
  /** DLQ Producer für das Senden fehlgeschlagener Events */
  dlqProducer: Producer;
}

export interface KASPAConsumerConfig {
  groupId: string;
  topics: string[];
  onCrashSignal?: (event: CrashSignalEvent) => Promise<void>;
  onTradeEvent?: (event: TradeEvent) => Promise<void>;
  onTelemetry?: (event: TelemetryEvent) => Promise<void>;
  /** Optional: DLQ Konfiguration */
  dlq?: DLQConfig;
  /** Optional: Event-Validator */
  validateEvent?: (event: KASPAEvent) => boolean;
}

interface ProcessedMessage {
  topic: string;
  partition: number;
  offset: string;
  event: KASPAEvent;
  retries: number;
  lastError?: string;
}

export class KASPAConsumerWithDLQ {
  private consumer: Consumer;
  private dlqProducer: Producer | null = null;
  private readonly config: KASPAConsumerConfig;
  private readonly dlqTopics: Set<string> = new Set();

  constructor(config: KASPAConsumerConfig, broker: string = 'localhost:9092') {
    const kafka = new Kafka({
      clientId: `kaspa-consumer-dlq-${config.groupId}`,
      brokers: [broker],
      logLevel: logLevel.WARN,
      retry: {
        initialRetryTime: 100,
        retries: 3,
      },
    });

    this.consumer = kafka.consumer({ groupId: config.groupId });
    this.config = config;

    // DLQ Producer erstellen wenn DLQ konfiguriert
    if (config.dlq) {
      this.dlqProducer = config.dlq.dlqProducer;
      this.createDLQTopics(config.topics);
    }
  }

  private createDLQTopics(sourceTopics: string[]): void {
    for (const topic of sourceTopics) {
      const dlqTopic = `${topic}.dlq`;
      this.dlqTopics.add(dlqTopic);
    }
  }

  async connect(): Promise<void> {
    await this.consumer.connect();

    for (const dlqTopic of this.dlqTopics) {
      try {
        // DLQ Topics werden automatisch erstellt bei erstem Send
        console.log(`[DLQConsumer] DLQ Topic bereit: ${dlqTopic}`);
      } catch (error) {
        console.warn(`[DLQConsumer] DLQ Topic konnte nicht vorbereitet werden: ${dlqTopic}`);
      }
    }
  }

  async disconnect(): Promise<void> {
    await this.consumer.disconnect();
  }

  async start(): Promise<void> {
    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        const { topic, partition, message } = payload;
        const offset = message.offset;

        if (!message.value) {
          console.warn(`[DLQConsumer] Leere Nachricht bei ${topic}[${partition}]@${offset}`);
          return;
        }

        let event: KASPAEvent;
        try {
          event = JSON.parse(message.value.toString()) as KASPAEvent;
        } catch (parseError) {
          // JSON-Parsing fehlgeschlagen → direkt in DLQ
          console.error(`[DLQConsumer] JSON Parse Error bei ${topic}[${partition}]@${offset}`);
          await this.sendToDLQ(topic, message.value.toString(), {
            error: 'JSON_PARSE_ERROR',
            errorMessage: (parseError as Error).message,
            originalTopic: topic,
            partition,
            offset,
            timestamp: Date.now(),
          });
          return;
        }

        // Event-Validierung falls konfiguriert
        if (this.config.validateEvent && !this.config.validateEvent(event)) {
          console.error(`[DLQConsumer] Event Validation Failed: ${event.type}`);
          await this.sendToDLQ(topic, message.value.toString(), {
            error: 'VALIDATION_FAILED',
            errorMessage: 'Event failed validation check',
            originalTopic: topic,
            partition,
            offset,
            timestamp: Date.now(),
          });
          return;
        }

        // Event verarbeiten mit Retry-Logik
        const processed: ProcessedMessage = {
          topic,
          partition,
          offset,
          event,
          retries: 0,
        };

        await this.processWithRetry(processed);
      },
    });
  }

  private async processWithRetry(processed: ProcessedMessage): Promise<void> {
    const { topic, partition, offset, event } = processed;
    const maxRetries = this.config.dlq?.maxRetries ?? 3;
    const retryDelayMs = this.config.dlq?.retryDelayMs ?? 1000;

    while (processed.retries < maxRetries) {
      try {
        switch (topic) {
          case 'kaspa.crash-signals':
            await this.config.onCrashSignal?.(event as CrashSignalEvent);
            break;
          case 'kaspa.trade-events':
            await this.config.onTradeEvent?.(event as TradeEvent);
            break;
          case 'kaspa.telemetry':
            await this.config.onTelemetry?.(event as TelemetryEvent);
            break;
          default:
            console.warn(`[DLQConsumer] Unbekanntes Topic: ${topic}`);
            return;
        }

        // Erfolgreich verarbeitet
        console.log(`[DLQConsumer] ✅ ${event.type} von ${topic}[${partition}]@${offset} verarbeitet`);
        return;

      } catch (error) {
        processed.retries++;
        processed.lastError = (error as Error).message;

        console.error(
          `[DLQConsumer] ❌ ${event.type} Fehler (Versuch ${processed.retries}/${maxRetries}):`,
          processed.lastError
        );

        if (processed.retries < maxRetries) {
          // Warten vor Retry
          await new Promise(resolve => setTimeout(resolve, retryDelayMs * processed.retries));
        }
      }
    }

    // Alle Retries exhausted → in DLQ
    console.error(
      `[DLQConsumer] 🚨 ${event.type} nach ${maxRetries} Versuchen in DLQ.`
    );
    await this.sendToDLQ(topic, JSON.stringify(event), {
      error: 'MAX_RETRIES_EXCEEDED',
      errorMessage: processed.lastError,
      originalTopic: topic,
      partition,
      offset,
      retries: processed.retries,
      timestamp: Date.now(),
    });
  }

  private async sendToDLQ(
    originalTopic: string,
    eventValue: string,
    errorInfo: Record<string, unknown>
  ): Promise<void> {
    if (!this.dlqProducer) {
      console.error(`[DLQConsumer] DLQ Producer nicht konfiguriert, Event verloren!`);
      return;
    }

    const dlqTopic = `${originalTopic}.dlq`;

    try {
      await this.dlqProducer.send({
        topic: dlqTopic,
        messages: [{
          key: errorInfo['originalTopic'] as string || 'unknown',
          value: JSON.stringify({
            originalEvent: JSON.parse(eventValue),
            error: errorInfo,
            dlqTimestamp: Date.now(),
            dlqVersion: '1.0.0',
          }),
          headers: {
            'error-type': String(errorInfo['error']),
            'original-topic': originalTopic,
            'dlq-timestamp': String(Date.now()),
          },
        }],
      });

      console.log(`[DLQConsumer] 📝 Event in ${dlqTopic} geschrieben`);

    } catch (dlqError) {
      console.error(
        `[DLQConsumer] 🚨 KRITISCH: DLQ Write Failed für ${originalTopic}:`,
        dlqError
      );
      // Event ist jetzt komplett verloren - Alert auslösen!
      this.alertDLQFailure(originalTopic, eventValue, errorInfo);
    }
  }

  private alertDLQFailure(
    originalTopic: string,
    eventValue: string,
    errorInfo: Record<string, unknown>
  ): void {
    // Hier könnte ein Alert ausgelöst werden (PagerDuty, Slack, etc.)
    console.error(`
╔═══════════════════════════════════════════════════════════════════╗
║  🚨 DLQ FAILURE ALERT - KAS PA SYSTEM                         ║
╠═══════════════════════════════════════════════════════════════════╣
║  Topic: ${originalTopic.padEnd(54)}║
║  Error: ${String(errorInfo['error']).padEnd(54)}║
║  Time:  ${new Date().toISOString().padEnd(54)}║
║                                                                   ║
║  Event Data: ${eventValue.substring(0, 50).padEnd(50)}║
╚═══════════════════════════════════════════════════════════════════╝
    `);
  }

  /**
   * DLQ Topics aufräumen (ältere Events löschen)
   * Kann periodisch aufgerufen werden
   */
  async cleanupDLQ(retentionHours: number = 24): Promise<void> {
    if (!this.dlqProducer) return;

    console.log(`[DLQConsumer] DLQ Cleanup (Retention: ${retentionHours}h)`);

    for (const dlqTopic of this.dlqTopics) {
      try {
        // Events älter als retentionHours löschen
        console.log(`[DLQConsumer] Würde ${dlqTopic} aufräumen...`);
        // Hinweis: Kafka unterstützt kein direktes Löschen von alten Events
        // Stattdessen sollte retention config verwendet werden
      } catch (error) {
        console.error(`[DLQConsumer] DLQ Cleanup Fehler für ${dlqTopic}:`, error);
      }
    }
  }
}

/**
 * DLQ-fähigen Consumer erstellen mit Standard-Konfiguration
 */
export function createDLQConsumer(
  groupId: string,
  topics: string[],
  broker: string = 'localhost:9092'
): KASPAConsumerWithDLQ {
  const kafka = new Kafka({
    clientId: `kaspa-${groupId}`,
    brokers: [broker],
  });

  const dlqProducer = kafka.producer();

  return new KASPAConsumerWithDLQ({
    groupId,
    topics,
    dlq: {
      topicPrefix: 'kaspa',
      maxRetries: 3,
      retryDelayMs: 1000,
      dlqProducer,
    },
    onCrashSignal: async (event) => {
      console.log(`[Consumer] CRASH_SIGNAL: ${event.coin} = ${event.crashProbability}`);
    },
    onTradeEvent: async (event) => {
      console.log(`[Consumer] TRADE: ${event.action} ${event.symbol}`);
    },
    onTelemetry: async (event) => {
      console.log(`[Consumer] TELEMETRY: ${event.propagationTimeMs}ms`);
    },
    validateEvent: (event) => {
      // Basis-Validierung
      if (!event.type || !event.timestamp) return false;
      if (event.type === 'TRADE_EVENT') {
        const trade = event as TradeEvent;
        if (!trade.symbol || trade.amount <= 0) return false;
      }
      return true;
    },
  });
}
