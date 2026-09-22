import { ProfilePreview } from './user.entity';

const SECRET_PATTERN = /(secret|password|token|api[_-]?key|credential|private[_-]?key)/i;

export function manifestLooksUnsafe(manifest: string): boolean {
  return SECRET_PATTERN.test(manifest);
}

export function redactPreview(preview: ProfilePreview): ProfilePreview {
  return {
    ...preview,
    diff: preview.diff.replace(SECRET_PATTERN, '[redacted]'),
  };
}
