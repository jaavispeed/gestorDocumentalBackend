import type { BrowserContext, Page } from 'playwright';
import type { CasoPruebaGeneradoIa } from './vision-analyzer.js';
import type { PantallaDetectadaPorUrl, TipoCaptura } from './tipos.js';

export interface EvidenciaCapturada {
  fileName: string;
  caption: string;
  tipo: TipoCaptura;
  url: string;
  rutaLocal: string;
  disparador?: string;
}

export interface ResultadoExploracionPantalla {
  urlPrincipal: string;
  capturas: EvidenciaCapturada[];
  pantallasDetectadas: PantallaDetectadaPorUrl[];
  campos: Array<{ label: string; meaning?: string }>;
  acciones: Array<{ name: string; description?: string }>;
}

export interface OpcionesFlujoQa {
  nombreApp: string;
  urlInicioLogin: string;
  nombrePantalla: string;
  rutaPantalla: string;
  descripcionPantalla?: string;
  indicacionIa?: string;
  casosExistentes?: Array<{ codigo?: string; titulo: string }>;
  authConfig?: any;
  headless: boolean;
  directorioCapturas: string;
  geminiApiKey?: string;
  geminiModel?: string;
  modo: 'completo' | 'faltantes';
}

export interface ResultadoFlujoQa {
  exploracion: ResultadoExploracionPantalla;
  casosGenerados: CasoPruebaGeneradoIa[];
}

export interface IAutenticadorWeb {
  autenticar(
    page: Page,
    context: BrowserContext,
    urlInicioLogin: string,
    authConfig?: any,
  ): Promise<boolean>;
}

export interface IExploradorPantalla {
  explorar(opciones: {
    page: Page;
    urlPantalla: string;
    nombrePantalla: string;
    directorioCapturas: string;
    maxInteracciones?: number;
  }): Promise<ResultadoExploracionPantalla>;
}
