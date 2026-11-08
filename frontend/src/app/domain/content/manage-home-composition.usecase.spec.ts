import { firstValueFrom, of } from 'rxjs';
import { IContentRepository } from './content.repository';
import { HomeBlockKind as Kind, HomeComposition } from './home-composition';
import { ManageHomeCompositionUseCase } from './manage-home-composition.usecase';
describe('home composition command', () => {
  it('validates before dispatch and maps a full replacement to the expected revision', async () => {
    const repo = {readAdmin: vi.fn(), readPublic: vi.fn(), replace: vi.fn(() => of({revision: 2, sections: []}))};
    const usecase = new ManageHomeCompositionUseCase(repo as IContentRepository);
    const invalid: HomeComposition = {revision: 1, sections: [{key: 'x', kind: Kind.Unknown, active: false, sortOrder: 0, content: {title: ''}, updatedAt: null}]};
    await expect(firstValueFrom(usecase.execute(invalid))).rejects.toThrow(); expect(repo.replace).not.toHaveBeenCalled();
    await firstValueFrom(usecase.execute({revision: 1, sections: []})); expect(repo.replace).toHaveBeenCalledWith({expectedRevision: 1, sections: []});
  });
});
