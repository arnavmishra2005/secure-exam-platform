import { BlockList, isIP } from 'node:net';
/** Parse once at startup/use; malformed allowlists fail closed. Empty means unrestricted. */
export function labNetworkAllows(address: string | undefined, cidrs: string | undefined): boolean {
  if (!cidrs?.trim()) return true;
  const list = new BlockList();
  for (const entry of cidrs.split(',')) {
    const [ip, bits, extra] = entry.trim().split('/');
    const family = isIP(ip);
    const prefix = bits === undefined ? family === 4 ? 32 : 128 : Number(bits);
    if (!family || extra !== undefined || bits === '' || !Number.isInteger(prefix) || prefix < 0 || prefix > (family === 4 ? 32 : 128)) throw new Error('Invalid EXAM_ALLOWED_CIDRS');
    list.addSubnet(ip, prefix, family === 4 ? 'ipv4' : 'ipv6');
  }
  const ip = address?.replace(/^::ffff:(?=\d+\.)/i, '') ?? '';
  const family = isIP(ip);
  return !!family && list.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}
