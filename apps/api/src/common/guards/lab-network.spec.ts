import { labNetworkAllows } from './lab-network';
describe('lab network allowlist', () => {
  it('handles LAN addresses, mapped IPv4 and IPv6', () => {
    expect(labNetworkAllows('10.20.9.7', '10.20.0.0/16')).toBe(true);
    expect(labNetworkAllows('::ffff:10.20.9.7', '10.20.0.0/16')).toBe(true);
    expect(labNetworkAllows('10.21.9.7', '10.20.0.0/16')).toBe(false);
    expect(labNetworkAllows('fd00::2', 'fd00::/64')).toBe(true);
    expect(labNetworkAllows(undefined, '10.20.0.0/16')).toBe(false);
  });
  it.each(['bad', '10.0.0.0/33', '10.0.0.0/', '::/129'])('rejects malformed configuration %s', value => {
    expect(() => labNetworkAllows('10.0.0.1', value)).toThrow('Invalid EXAM_ALLOWED_CIDRS');
  });
});
