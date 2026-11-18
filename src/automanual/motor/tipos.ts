export interface TemaCliente {
  primaryColor: string;
  secondaryColor: string;
  accentColor?: string;
  fontFamily: string;
  logoPath: string;
}

export interface ConfiguracionAutoExploracion {
  enabled?: boolean;
  exploreFilters?: boolean;
  exploreSelects?: boolean;
  exploreTabs?: boolean;
  exploreSearch?: boolean;
  exploreButtons?: boolean;
  exploreRowActions?: boolean;
  maxSelectCaptures?: number;
  maxTabCaptures?: number;
  maxButtonCaptures?: number;
  maxTabButtonCaptures?: number;
  maxTotalScreenshots?: number;
  safeReadOnlyNetwork?: boolean;
}

export type TipoCaptura =
  | 'main'
  | 'filters'
  | 'selector'
  | 'search-results'
  | 'table'
  | 'tab'
  | 'subview'
  | 'detail'
  | 'modal'
  | 'action';

export interface CapturaPantalla {
  fileName: string;
  caption: string;
  kind?: TipoCaptura;
  userNote?: string;
}

export interface InformacionTablaDescubierta {
  title?: string;
  columns: string[];
  rowCount: number;
  sampleRows?: string[][];
}

export interface AccionSeccion {
  name: string;
  description?: string;
  triggerSelector?: string;
  captureSelector?: string;
  waitForSelector?: string;
}

export interface SeccionCliente {
  id: string;
  name?: string;
  title: string;
  route: string;
  menuPath?: string[];
  description?: string;
  codePaths?: string[];
  actions?: AccionSeccion[];
  autoExplore?: boolean | ConfiguracionAutoExploracion;
  waitForSelector?: string;
  notes?: string;
}

export interface ModuloCliente {
  id: string;
  name?: string;
  title: string;
  description?: string;
  sections: SeccionCliente[];
}

export interface ConfiguracionAutenticacion {
  username?: string;
  password?: string;
  ssoTriggerSelector?: string;
  userSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
}

export interface ConfiguracionCliente {
  id: string;
  name: string;
  appUrl: string;
  startCommand?: string;
  auth?: ConfiguracionAutenticacion;
  autoExplore?: boolean | ConfiguracionAutoExploracion;
  theme: TemaCliente;
  modules: ModuloCliente[];
  hasSession?: boolean;
  hasManual?: boolean;
}

export interface CampoFormularioUsuario {
  label: string;
  isRequired: boolean;
  meaning: string;
  example: string;
  options?: string[];
}

export interface AccionPantallaUsuario {
  name: string;
  description: string;
}

export interface ElementoVisualPantalla {
  name: string;
  type: string;
  description: string;
}

export interface SeccionDocGenerada extends SeccionCliente {
  moduleId: string;
  moduleTitle: string;
  howToReach: string[];
  screenshots: CapturaPantalla[];
  userGuide: {
    purpose: string;
    screenDetail?: {
      purpose: string;
      howToUse: string;
    };
    stepByStep: Array<{
      stepNumber: number;
      title: string;
      description: string;
    }>;
    fields: CampoFormularioUsuario[];
    actions: AccionPantallaUsuario[];
    visualElements?: ElementoVisualPantalla[];
    alerts?: string[];
    tips: string[];
  };
}
