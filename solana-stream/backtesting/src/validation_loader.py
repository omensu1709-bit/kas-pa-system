"""
Validation Events Dataset

Week 3-4: Part of metric reconstruction pipeline
"""

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional


@dataclass
class ValidationEvent:
    """A historical crash event for validation"""
    id: str
    name: str
    token: Optional[str]
    startDate: datetime
    endDate: datetime
    peakPrice: Optional[float]
    crashPrice: Optional[float]
    maxDrawdown: float
    marketCapStart: Optional[float]
    marketCapEnd: Optional[float]
    notes: str
    
    # Expected signals
    expectedHawkesSpike: bool
    expectedEntropyDrop: bool
    expectedFragmentationSpike: bool
    expectedSuperspreaderActivation: bool


VALIDATION_EVENTS: List[ValidationEvent] = [
    ValidationEvent(
        id='TRUMP-2025-01',
        name='TRUMP Memecoin Crash',
        token='TRUMP',
        startDate=datetime(2025, 1, 17),
        endDate=datetime(2025, 1, 19),
        peakPrice=73.0,
        crashPrice=8.0,
        maxDrawdown=0.89,
        marketCapStart=None,
        marketCapEnd=None,
        notes='TRUMP memecoin went from $73 ATH to $8 in 24 hours',
        expectedHawkesSpike=True,
        expectedEntropyDrop=True,
        expectedFragmentationSpike=True,
        expectedSuperspreaderActivation=True,
    ),
    ValidationEvent(
        id='LIBRA-2025-02',
        name='LIBRA Token Scandal',
        token='LIBRA',
        startDate=datetime(2025, 2, 14),
        endDate=datetime(2025, 2, 15),
        peakPrice=4.5,
        crashPrice=0.10,
        maxDrawdown=0.97,
        marketCapStart=4.5e9,
        marketCapEnd=0.15e9,
        notes='$4.5B market cap to near zero. Insider cash-out of $107M',
        expectedHawkesSpike=True,
        expectedEntropyDrop=True,
        expectedFragmentationSpike=True,
        expectedSuperspreaderActivation=True,
    ),
    ValidationEvent(
        id='SOL-2025-Q1',
        name='SOL 64% Correction',
        token='SOL',
        startDate=datetime(2025, 1, 1),
        endDate=datetime(2025, 4, 15),
        peakPrice=294.0,
        crashPrice=105.0,
        maxDrawdown=0.64,
        marketCapStart=None,
        marketCapEnd=None,
        notes='Macro-driven SOL correction from $294 ATH to ~$105',
        expectedHawkesSpike=False,
        expectedEntropyDrop=True,
        expectedFragmentationSpike=False,
        expectedSuperspreaderActivation=True,
    ),
    ValidationEvent(
        id='OM-2025-04',
        name='Mantra OM Collapse',
        token='OM',
        startDate=datetime(2025, 4, 10),
        endDate=datetime(2025, 4, 13),
        peakPrice=6.5,
        crashPrice=0.5,
        maxDrawdown=0.92,
        marketCapStart=5.6e9,
        marketCapEnd=0.4e9,
        notes='$5.6B evaporated in hours',
        expectedHawkesSpike=True,
        expectedEntropyDrop=True,
        expectedFragmentationSpike=True,
        expectedSuperspreaderActivation=True,
    ),
    ValidationEvent(
        id='MEMECAP-2024-2025',
        name='Memecoin Market Cap Collapse',
        token=None,
        startDate=datetime(2024, 12, 1),
        endDate=datetime(2025, 11, 30),
        peakPrice=None,
        crashPrice=None,
        maxDrawdown=0.75,
        marketCapStart=150.6e9,
        marketCapEnd=38e9,
        notes='$150.6B memecoin market cap collapsed to $38B',
        expectedHawkesSpike=True,
        expectedEntropyDrop=True,
        expectedFragmentationSpike=False,
        expectedSuperspreaderActivation=True,
    ),
    ValidationEvent(
        id='WIF-BONK-POPCAT-2024',
        name='WIF/BONK/POPCAT Crashes',
        token=None,
        startDate=datetime(2024, 10, 1),
        endDate=datetime(2025, 3, 31),
        peakPrice=None,
        crashPrice=None,
        maxDrawdown=0.85,
        marketCapStart=None,
        marketCapEnd=None,
        notes='Major memecoins crashed 80-91% from their ATHs',
        expectedHawkesSpike=True,
        expectedEntropyDrop=True,
        expectedFragmentationSpike=True,
        expectedSuperspreaderActivation=True,
    ),
]


def getEventTimeRanges() -> List[dict]:
    """Get time ranges for all events"""
    return [
        {
            'eventId': e.id,
            'startTime': int(e.startDate.timestamp()),
            'endTime': int(e.endDate.timestamp()),
            'startSlot': 0,
            'endSlot': 0,
        }
        for e in VALIDATION_EVENTS
    ]


def getDangerWindow(event_id: str) -> tuple:
    """Get the danger window (24h before crash) for an event"""
    for e in VALIDATION_EVENTS:
        if e.id == event_id:
            start = e.startDate.timestamp() - 24 * 3600
            end = e.startDate.timestamp()
            return (start, end)
    return (0, 0)


if __name__ == '__main__':
    print("Validation Events:")
    for e in VALIDATION_EVENTS:
        print(f"  {e.id}: {e.name}")
        print(f"    {e.startDate.date()} to {e.endDate.date()}")
        print(f"    Max drawdown: {e.maxDrawdown*100:.0f}%")
