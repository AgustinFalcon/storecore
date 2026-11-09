import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HomeBlockContent, HomeBlockKind, HomeComposition, HomeSection } from '../../domain/content/home-composition';
import { HomeContentPhase } from '../../domain/user/home-content-phase';
import { homeContentDirty, UserContentState } from './user-content.store';
import { FeatureStatusComponent } from '../../shared/feature-status.component';
import { HomeBlocksComponent } from '../../shared/home-blocks.component';
@Component({
  selector: 'sc-user-content-view',
  imports: [FormsModule, FeatureStatusComponent, HomeBlocksComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-content.view.html',
  styleUrl: './user-content.view.scss',
})
export class UserContentViewComponent {
  @Input({ required: true }) state!: UserContentState;
  readonly Phase = HomeContentPhase;
  readonly kinds = HomeBlockKind.editable;
  @Output() readonly homeChange = new EventEmitter<HomeComposition>();
  @Output() readonly save = new EventEmitter<void>();
  @Output() readonly retry = new EventEmitter<void>();
  @Output() readonly discard = new EventEmitter<void>();
  get dirty(): boolean { return homeContentDirty(this.state); }
  retryOperation(): void { if (this.dirty && !this.state.conflict) this.save.emit(); else this.retry.emit(); }
  private emit(sections: readonly HomeSection[]): void {
    this.homeChange.emit({ ...this.state.home, sections: sections.map((section, sortOrder) => ({ ...section, sortOrder })) });
  }
  add(kind: HomeBlockKind): void {
    if (!kind.known) return;
    this.emit([...this.state.home.sections, { key: 'block-' + crypto.randomUUID(), kind, active: true, sortOrder: this.state.home.sections.length, content: kind.blankContent(), updatedAt: null }]);
  }
  remove(index: number): void { this.emit(this.state.home.sections.filter((_, i) => i !== index)); }
  move(index: number, delta: number): void {
    const sections = [...this.state.home.sections], target = index + delta;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    this.emit(sections);
  }
  patch(index: number, content: Partial<HomeBlockContent>): void {
    this.emit(this.state.home.sections.map((section, i) => i === index && section.kind.known ? { ...section, content: { ...section.content, ...content } } : section));
  }
  activate(index: number, active: boolean): void { this.emit(this.state.home.sections.map((section, i) => i === index && section.kind.known ? { ...section, active } : section)); }
  references(index: number, value: string): void {
    const refs = value.split(',').map(item => item.trim()).filter(Boolean);
    this.patch(index, this.state.home.sections[index].kind.referencesCategories ? { categoryIds: refs.map(Number) } : { skus: refs });
  }
}
