export class LoginStage {
  private constructor(readonly wire: string, readonly label: string) {}
  static readonly CollectCredentials = new LoginStage('COLLECT_CREDENTIALS', 'Ingresar credenciales');
  static readonly Authenticate = new LoginStage('AUTHENTICATE', 'Verificando acceso');
  static readonly SelectContext = new LoginStage('SELECT_CONTEXT', 'Elegir acceso');
  static readonly CompleteAccess = new LoginStage('COMPLETE_ACCESS', 'Acceso completo');
  static readonly Unknown = new LoginStage('', 'Etapa no reconocida');
  static fromWire(raw: unknown): LoginStage { return STAGES.get(raw) ?? LoginStage.Unknown; }
}
const STAGES = new Map<unknown, LoginStage>([LoginStage.CollectCredentials, LoginStage.Authenticate, LoginStage.SelectContext, LoginStage.CompleteAccess].map((stage) => [stage.wire, stage]));
