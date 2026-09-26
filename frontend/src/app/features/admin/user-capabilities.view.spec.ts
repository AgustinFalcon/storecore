import { UserCapabilitiesViewComponent } from './user-capabilities.view';

describe('capability console', () => {
  it('shows the five states and does not offer a flip', () => {
    const view = new UserCapabilitiesViewComponent();
    expect(view.states).toEqual(['DISABLED', 'READ_ONLY', 'ACTIVE', 'PAUSED', 'ERROR']);
    expect(view.flipTitle).toBe('Esta instalación no prende capabilities desde la consola.');
  });
});
