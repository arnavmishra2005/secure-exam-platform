import { mean, median, percentage, percentageHistogram, rankByScore, standardDeviation } from './results-stats';

describe('results-stats', () => {
  it('computes mean, median and standard deviation', () => {
    expect(mean([])).toBeNull();
    expect(mean([2, 4, 9])).toBe(5);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });

  it('guards a zero maximum when converting to a percentage', () => {
    expect(percentage(3, 0)).toBe(0);
    expect(percentage(3, 4)).toBe(75);
  });

  it('buckets percentages into ten bins, with 100 in the last and out-of-range values clamped', () => {
    const histogram = percentageHistogram([0, 9.99, 10, 55, 100, -5, 120]);
    expect(histogram).toHaveLength(10);
    expect(histogram[0]).toEqual({ from: 0, to: 10, count: 3 }); // 0, 9.99, -5
    expect(histogram[1].count).toBe(1);
    expect(histogram[5].count).toBe(1);
    expect(histogram[9]).toEqual({ from: 90, to: 100, count: 2 }); // 100, 120
  });

  it('uses competition ranking for ties and lists the faster attempt first within a tie', () => {
    const ranked = rankByScore([
      { id: 'slow', score: 8, timeTakenSeconds: 900 },
      { id: 'top', score: 10, timeTakenSeconds: 1000 },
      { id: 'fast', score: 8, timeTakenSeconds: 300 },
      { id: 'last', score: 2, timeTakenSeconds: null },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ['top', 1],
      ['fast', 2],
      ['slow', 2],
      ['last', 4],
    ]);
  });
});
