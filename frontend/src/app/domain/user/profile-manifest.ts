import { ProfilePreview } from './user.entity';

const SECRET_PATTERN = /(secret|password|token|api[_-]?key|credential|private[_-]?key|oauth|merchant|legal_identity|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;

export function manifestLooksUnsafe(manifest: string): boolean {
  if (SECRET_PATTERN.test(manifest)) return true;
  try { return SECRET_PATTERN.test(JSON.stringify(JSON.parse(manifest))); } catch { return false; }
}

export function redactPreview(preview: ProfilePreview): ProfilePreview {
  return {
    ...preview,
    diff: manifestLooksUnsafe(preview.diff) ? '[redacted]' : preview.diff,
  };
}
