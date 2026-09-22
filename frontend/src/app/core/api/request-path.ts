/** Path without query/hash so interceptor skips stay stable. */
export function requestPath(url: string): string {
  const withoutHash = url.split('#')[0] ?? url;
  return withoutHash.split('?')[0] ?? withoutHash;
}
