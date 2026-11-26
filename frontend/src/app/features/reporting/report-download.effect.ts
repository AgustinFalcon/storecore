import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';
import { ReportExportFile } from '../../domain/reporting/report';

@Injectable({ providedIn: 'root' })
export class ReportDownloadEffect {
  constructor(@Inject(DOCUMENT) private readonly document: Document) {}

  save(file: ReportExportFile): void {
    const url = URL.createObjectURL(file.blob);
    try {
      const anchor = this.document.createElement('a');
      anchor.href = url;
      anchor.download = file.filename;
      anchor.rel = 'noopener';
      anchor.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
