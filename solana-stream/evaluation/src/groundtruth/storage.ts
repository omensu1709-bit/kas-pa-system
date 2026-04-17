/**
 * KAS PA v4.3 - Data Storage and Versioning
 *
 * Saubere Ablagestruktur mit klarer Trennung der Layer:
 * - raw/           : Rohdaten
 * - candidates/    : Event-Kandidaten
 * - auto-labels/   : Vorläufige Auto-Labels
 * - reviews/       : Manuelle Reviews
 * - final/         : Finale Ground Truth Labels
 *
 * Jedes Label ist versioniert und auditierbar.
 */

import {
  RawObservation,
  EventCandidate,
  PreliminaryLabel,
  HumanReview,
  FinalGroundTruthLabel,
} from './schema.js';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ============================================================================
// STORAGE CONFIGURATION
// ============================================================================

export interface StorageConfig {
  basePath: string;
  partitionBy: 'token' | 'date' | 'label';
  compression: boolean;
  versioning: boolean;
}

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  basePath: '/data/trinity_apex/solana-stream/evaluation/data/gt',
  partitionBy: 'date',
  compression: true,
  versioning: true,
};

// ============================================================================
// STORAGE LAYER DIRECTORIES
// ============================================================================

export const STORAGE_STRUCTURE = {
  raw: 'raw',
  candidates: 'candidates',
  'auto-labels': 'auto-labels',
  reviews: 'reviews',
  final: 'final',
} as const;

export type StorageLayer = keyof typeof STORAGE_STRUCTURE;

// ============================================================================
// STORAGE MANAGER
// ============================================================================

export class GroundTruthStorage {
  private config: StorageConfig;
  private initialized: boolean = false;

  constructor(config: Partial<StorageConfig> = {}) {
    this.config = { ...DEFAULT_STORAGE_CONFIG, ...config };
  }

  /**
   * Initialisiere Storage-Verzeichnisse
   */
  initialize(): void {
    if (this.initialized) return;

    // Create base directory
    if (!existsSync(this.config.basePath)) {
      mkdirSync(this.config.basePath, { recursive: true });
    }

    // Create subdirectories
    for (const layer of Object.values(STORAGE_STRUCTURE)) {
      const path = join(this.config.basePath, layer);
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
      }
    }

    this.initialized = true;
    console.log(`[GroundTruthStorage] Initialized at ${this.config.basePath}`);
  }

  // ===========================================================================
  // RAW OBSERVATIONS
  // ===========================================================================

  /**
   * Speichere Rohdaten-Snapshot
   */
  saveRawObservation(observation: RawObservation): void {
    this.ensureInitialized();
    const path = this.getPath('raw', observation.id, 'jsonl');
    const line = JSON.stringify(observation);
    // appendFileSync(path, line + '\n');
    console.log(`[Storage] Would save raw observation to ${path}`);
  }

  /**
   * Lade Rohdaten für Zeitraum
   */
  loadRawObservations(startTime: number, endTime: number): RawObservation[] {
    this.ensureInitialized();
    const path = join(this.config.basePath, 'raw');
    console.log(`[Storage] Would load raw observations from ${path} for [${startTime}, ${endTime}]`);
    return []; // Placeholder
  }

  // ===========================================================================
  // CANDIDATES
  // ===========================================================================

  /**
   * Speichere Event-Kandidaten
   */
  saveCandidates(candidates: EventCandidate[]): number {
    this.ensureInitialized();
    const path = join(this.config.basePath, 'candidates', `candidates_${Date.now()}.jsonl`);
    const jsonl = candidates.map(c => JSON.stringify(c)).join('\n');
    // writeFileSync(path, jsonl + '\n');
    console.log(`[Storage] Would save ${candidates.length} candidates to ${path}`);
    return candidates.length;
  }

  /**
   * Lade alle Kandidaten
   */
  loadAllCandidates(): EventCandidate[] {
    this.ensureInitialized();
    const path = join(this.config.basePath, 'candidates');
    console.log(`[Storage] Would load all candidates from ${path}`);
    return [];
  }

  /**
   * Lade Kandidaten nach Status
   */
  loadCandidatesByStatus(status: EventCandidate['status']): EventCandidate[] {
    this.ensureInitialized();
    const all = this.loadAllCandidates();
    return all.filter(c => c.status === status);
  }

  // ===========================================================================
  // AUTO-LABELS
  // ===========================================================================

  /**
   * Speichere Auto-Labels
   */
  saveAutoLabels(labels: PreliminaryLabel[]): number {
    this.ensureInitialized();
    const path = join(this.config.basePath, 'auto-labels', `autolabels_${Date.now()}.jsonl`);
    const jsonl = labels.map(l => JSON.stringify(l)).join('\n');
    // writeFileSync(path, jsonl + '\n');
    console.log(`[Storage] Would save ${labels.length} auto-labels to ${path}`);
    return labels.length;
  }

  /**
   * Lade Auto-Labels nach Status
   */
  loadAutoLabelsByStatus(status: PreliminaryLabel['status']): PreliminaryLabel[] {
    this.ensureInitialized();
    console.log(`[Storage] Would load auto-labels with status ${status}`);
    return [];
  }

  // ===========================================================================
  // REVIEWS
  // ===========================================================================

  /**
   * Speichere Review
   */
  saveReview(review: HumanReview): void {
    this.ensureInitialized();
    const path = join(this.config.basePath, 'reviews', `${review.reviewId}.json`);
    // writeFileSync(path, JSON.stringify(review, null, 2));
    console.log(`[Storage] Would save review to ${path}`);
  }

  /**
   * Lade Reviews für Candidate
   */
  loadReviewsForCandidate(candidateId: string): HumanReview[] {
    this.ensureInitialized();
    console.log(`[Storage] Would load reviews for candidate ${candidateId}`);
    return [];
  }

  // ===========================================================================
  // FINAL LABELS
  // ===========================================================================

  /**
   * Speichere finales Ground Truth Label
   */
  saveFinalLabel(label: FinalGroundTruthLabel): void {
    this.ensureInitialized();
    const path = join(
      this.config.basePath,
      'final',
      `${label.eventId}.json`
    );
    // writeFileSync(path, JSON.stringify(label, null, 2));
    console.log(`[Storage] Would save final label to ${path}`);
  }

  /**
   * Speichere mehrere finale Labels (Batch)
   */
  saveFinalLabelsBatch(labels: FinalGroundTruthLabel[]): number {
    this.ensureInitialized();
    const path = join(this.config.basePath, 'final', `groundtruth_${Date.now()}.jsonl`);
    const jsonl = labels.map(l => JSON.stringify(l)).join('\n');
    // writeFileSync(path, jsonl + '\n');
    console.log(`[Storage] Would save ${labels.length} final labels to ${path}`);
    return labels.length;
  }

  /**
   * Lade finales Label für Candidate
   */
  loadFinalLabel(candidateId: string): FinalGroundTruthLabel | undefined {
    this.ensureInitialized();
    const path = join(this.config.basePath, 'final', `gt_${candidateId}.json`);
    console.log(`[Storage] Would load final label from ${path}`);
    return undefined;
  }

  /**
   * Lade alle finalen Labels
   */
  loadAllFinalLabels(): FinalGroundTruthLabel[] {
    this.ensureInitialized();
    console.log(`[Storage] Would load all final labels`);
    return [];
  }

  /**
   * Lade finale Labels nach Label-Klasse
   */
  loadFinalLabelsByClass(labelClass: string): FinalGroundTruthLabel[] {
    this.ensureInitialized();
    const all = this.loadAllFinalLabels();
    return all.filter(l => l.labelClass === labelClass);
  }

  /**
   * Lade finale Labels nach Confidence-Band
   */
  loadFinalLabelsByConfidence(confidence: 'HIGH' | 'MEDIUM' | 'LOW'): FinalGroundTruthLabel[] {
    this.ensureInitialized();
    const all = this.loadAllFinalLabels();
    return all.filter(l => l.labelConfidence === confidence);
  }

  // ===========================================================================
  // EXPORT / IMPORT
  // ===========================================================================

  /**
   * Exportiere Ground Truth Dataset als JSONL
   */
  exportGroundTruthDataset(outputPath: string): number {
    const labels = this.loadAllFinalLabels();
    const groundTruthLabels = labels.filter(l => l.isGroundTruth);

    const jsonl = groundTruthLabels.map(l => JSON.stringify(l)).join('\n');
    // writeFileSync(outputPath, jsonl + '\n');
    console.log(`[Storage] Would export ${groundTruthLabels.length} ground truth labels to ${outputPath}`);
    return groundTruthLabels.length;
  }

  /**
   * Importiere Ground Truth Dataset aus JSONL
   */
  importGroundTruthDataset(inputPath: string): number {
    // const content = readFileSync(inputPath, 'utf-8');
    // const lines = content.split('\n').filter(l => l.trim());
    // const labels = lines.map(l => JSON.parse(l) as FinalGroundTruthLabel);
    console.log(`[Storage] Would import ground truth labels from ${inputPath}`);
    return 0;
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private ensureInitialized(): void {
    if (!this.initialized) {
      this.initialize();
    }
  }

  private getPath(layer: string, id: string, format: 'jsonl' | 'json'): string {
    return join(this.config.basePath, layer, `${id}.${format}`);
  }

  /**
   * Hole Storage-Statistiken
   */
  getStats(): {
    rawCount: number;
    candidateCount: number;
    autoLabelCount: number;
    reviewCount: number;
    finalLabelCount: number;
    groundTruthCount: number;
  } {
    this.ensureInitialized();
    // Placeholder - würde echte Counts aus Dateien lesen
    return {
      rawCount: 0,
      candidateCount: 0,
      autoLabelCount: 0,
      reviewCount: 0,
      finalLabelCount: 0,
      groundTruthCount: 0,
    };
  }
}

// Export singleton
export const groundTruthStorage = new GroundTruthStorage();

// ============================================================================
// VERSIONING HELPERS
// ============================================================================

export interface LabelVersion {
  version: string;
  timestamp: number;
  actor: string;
  changes: string[];
}

export function createVersionEntry(
  label: FinalGroundTruthLabel,
  actor: string,
  changes: string[]
): LabelVersion {
  return {
    version: label.labelVersion,
    timestamp: Date.now(),
    actor,
    changes,
  };
}

export function bumpVersion(currentVersion: string): string {
  const parts = currentVersion.split('.');
  const patch = parseInt(parts[2] || '0', 10) + 1;
  return `${parts[0]}.${parts[1]}.${patch}`;
}