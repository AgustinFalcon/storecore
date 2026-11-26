import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ReportDownloadEffect } from './report-download.effect';

describe('ReportDownloadEffect', () => {
  it('uses the validated filename and always revokes the temporary URL', () => {
    TestBed.configureTestingModule({ providers: [ReportDownloadEffect] });
    const document = TestBed.inject(DOCUMENT);
    const anchor = document.createElement('a');
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => undefined);
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const blob = new Blob(['csv']);
    TestBed.inject(ReportDownloadEffect).save({ filename: 'storecore-report.csv', blob });
    expect(create).toHaveBeenCalledWith(blob);
    expect(anchor.download).toBe('storecore-report.csv');
    expect(anchor.rel).toBe('noopener');
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:report');
  });
});
