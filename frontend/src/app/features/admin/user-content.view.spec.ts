import { TestBed } from '@angular/core/testing';
import { HomeContentPhase } from '../../domain/user/home-content-phase';
import { UserContentViewComponent } from './user-content.view';

describe('UserContentView', () => {
  it('previews edited copy as text, exposes pending changes and emits explicit publication/discard', () => {
    TestBed.configureTestingModule({ imports: [UserContentViewComponent] });
    const fixture = TestBed.createComponent(UserContentViewComponent);
    fixture.componentRef.setInput('state', { home: { title: '<script>Nuevo</script>', body: 'Texto editado' }, published: { title: 'Original', body: '' }, phase: HomeContentPhase.Editing, errorMessage: '' });
    fixture.detectChanges();
    const preview = fixture.nativeElement.querySelector('[aria-labelledby=content-preview-title]');
    expect(preview.textContent).toContain('<script>Nuevo</script>');
    expect(preview.querySelector('script')).toBeNull();
    expect(preview.textContent).toContain('Todavía no se publicaron');
    const save = vi.fn(); fixture.componentInstance.save.subscribe(save);
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(save).toHaveBeenCalledOnce();
    const discard = vi.fn(); fixture.componentInstance.discard.subscribe(discard);
    (Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[]).find((button) => button.textContent?.includes('Descartar'))?.click();
    expect(discard).toHaveBeenCalledOnce();
  });

  it('hides the editor until a confirmed load and locks fields while publishing', () => {
    TestBed.configureTestingModule({ imports: [UserContentViewComponent] });
    const fixture = TestBed.createComponent(UserContentViewComponent);
    fixture.componentRef.setInput('state', { home: { title: '', body: '' }, published: null, phase: HomeContentPhase.Loading, errorMessage: '' }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    fixture.componentRef.setInput('state', { home: { title: 'Nueva', body: '' }, published: { title: 'Anterior', body: '' }, phase: HomeContentPhase.Saving, errorMessage: '' }); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[role=status]').textContent).toContain(HomeContentPhase.Saving.label);
  });
});
