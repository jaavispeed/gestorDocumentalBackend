import * as path from 'path';
import * as os from 'os';
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
  const directorioTempBase = path.join(
    os.tmpdir(),
    'gestor-documental-automanual-runtime',
  );
  const directorioClientes = path.join(directorioTempBase, 'clientes');
  const directorioDocs = path.join(directorioTempBase, 'docs');
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
