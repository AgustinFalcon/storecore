import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { readApiBody } from '../../core/api/base-response';
import { IContentRepository } from '../../domain/content/content.repository';
import { HomeComposition, ReplaceHomeComposition } from '../../domain/content/home-composition';
import { mapHomeComposition } from './home-composition.mapper';
@Injectable()
export class ContentHttpRepository implements IContentRepository {
  constructor(private readonly http: HttpClient) {}
  readPublic(): Observable<HomeComposition> { return this.http.get<unknown>(`${environment.apiBaseUrl}/content/home`).pipe(map(body => mapHomeComposition(readApiBody(body), true))); }
  readAdmin(): Observable<HomeComposition> { return this.http.get<unknown>(`${environment.apiBaseUrl}/user/content/home`).pipe(map(body => mapHomeComposition(readApiBody(body)))); }
  replace(command: ReplaceHomeComposition): Observable<HomeComposition> {
    const sections = command.sections.map(section => ({ key: section.key, kind: section.kind.wire, active: section.active, sortOrder: section.sortOrder, content: section.content }));
    return this.http.put<unknown>(`${environment.apiBaseUrl}/user/content/home`, { expectedRevision: command.expectedRevision, sections }).pipe(map(body => mapHomeComposition(readApiBody(body))));
  }
}
