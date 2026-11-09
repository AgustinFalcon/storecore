import { ListMetadata } from './bounded-rows';

export class BoundedPageRequest {
  static readonly DefaultSize = 50;

  private constructor(
    readonly page: number,
    readonly size: number,
  ) {}

  static first(size = BoundedPageRequest.DefaultSize): BoundedPageRequest {
    return BoundedPageRequest.at(0, size);
  }

  static at(page: number, size = BoundedPageRequest.DefaultSize): BoundedPageRequest {
    if (!Number.isSafeInteger(page) || page < 0 || page > 10_000) {
      throw new RangeError('Invalid bounded page index.');
    }
    if (!Number.isSafeInteger(size) || size < 1 || size > 50) {
      throw new RangeError('Invalid bounded page size.');
    }
    return new BoundedPageRequest(page, size);
  }
}

export interface BoundedPageNavigation {
  readonly page: number;
  readonly totalPages: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
  readonly recoveryPage: number | null;
}

export function boundedPageNavigation(metadata: ListMetadata): BoundedPageNavigation {
  const valid = Number.isSafeInteger(metadata.total) && metadata.total >= 0
    && Number.isSafeInteger(metadata.page) && metadata.page >= 0 && metadata.page <= 10_000
    && Number.isSafeInteger(metadata.size) && metadata.size >= 1 && metadata.size <= 50;
  if (!valid) {
    return { page: 0, totalPages: 1, hasPrevious: false, hasNext: false, recoveryPage: null };
  }
  const totalPages = Math.max(1, Math.ceil(metadata.total / metadata.size));
  const recoveryPage = metadata.page >= totalPages ? totalPages - 1 : null;
  return {
    page: metadata.page,
    totalPages,
    hasPrevious: metadata.page > 0,
    hasNext: recoveryPage === null && metadata.page + 1 < totalPages,
    recoveryPage,
  };
}

