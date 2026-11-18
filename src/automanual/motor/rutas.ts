import * as path from 'path';
import fs from 'fs-extra';

export interface RutasAutomanual {
  directorioRaiz: string;
  directorioClientes: string;
  directorioDocs: string;
  archivoEnv: string;
  directorioPlantillas: string;
}

export function obtenerRutasAutomanual(): RutasAutomanual {
  const directorioRaiz = process.env.APP_ROOT || process.cwd();
  const directorioClientes = path.join(directorioRaiz, 'datos', 'automanual', 'clientes');
  const directorioDocs = path.join(directorioRaiz, 'datos', 'automanual', 'docs');
  const archivoEnv = path.join(directorioRaiz, '.env');
  const directorioPlantillas = path.join(
    directorioRaiz,
    'src',
    'automanual',
    'motor',
    'plantillas',
  );

  fs.ensureDirSync(directorioClientes);
  fs.ensureDirSync(directorioDocs);

  return {
    directorioRaiz,
    directorioClientes,
    directorioDocs,
    archivoEnv,
    directorioPlantillas,
  };
}
