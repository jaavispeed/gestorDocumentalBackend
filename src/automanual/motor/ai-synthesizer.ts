import {
  SeccionCliente,
  CampoFormularioUsuario,
  AccionPantallaUsuario,
  ElementoVisualPantalla,
} from './tipos.js';
import { InspeccionPaginaEnVivo } from './dom-inspector.js';
import { ResultadoAnalisisVision } from './vision-analyzer.js';

export interface DetallePantalla {
  purpose: string;
  howToUse: string;
}

export interface GuiaUsuarioSintetizada {
  purpose: string;
  screenDetail: DetallePantalla;
  stepByStep: Array<{
    stepNumber: number;
    title: string;
    description: string;
  }>;
  fields: CampoFormularioUsuario[];
  actions: AccionPantallaUsuario[];
  visualElements: ElementoVisualPantalla[];
  alerts: string[];
  tips: string[];
}

export class SintetizadorGuiaUsuario {
  public async sintetizarGuia(
    seccion: SeccionCliente,
    liveDom?: InspeccionPaginaEnVivo,
    visionResult?: ResultadoAnalisisVision | null,
  ): Promise<GuiaUsuarioSintetizada> {
    const fields: CampoFormularioUsuario[] = [];
    if (liveDom && liveDom.fields.length > 0) {
      fields.push(...liveDom.fields);
    }

    const actions: AccionPantallaUsuario[] = [];
    if (liveDom && liveDom.actions.length > 0) {
      actions.push(...liveDom.actions);
    }

    const lowerTitle = seccion.title.toLowerCase();
    let whatItDoes = '';

    if (
      liveDom?.pageDescription &&
      liveDom.pageDescription.length > 15 &&
      !/^vista de /i.test(liveDom.pageDescription)
    ) {
      whatItDoes = liveDom.pageDescription;
    } else if (
      seccion.description &&
      seccion.description.length > 20 &&
      !/^vista de /i.test(seccion.description)
    ) {
      whatItDoes = seccion.description.trim();
    } else {
      if (/carga|ingreso|registro|nuevo|formulario/i.test(lowerTitle)) {
        whatItDoes = `Esta pantalla permite ingresar, cargar y registrar nuevos movimientos de ${lowerTitle} en la plataforma.`;
      } else if (
        /consulta|reporte|monitor|cartola|historico|balanceo|cuadratura/i.test(
          lowerTitle,
        )
      ) {
        whatItDoes = `Esta pantalla permite consultar, filtrar y supervisar los registros e indicadores de ${lowerTitle}.`;
      } else if (
        /mantenedor|configuracion|parametro|perfil|asesor|banco|cliente/i.test(
          lowerTitle,
        )
      ) {
        whatItDoes = `Esta pantalla permite administrar las tablas maestras y actualizar la configuración de ${lowerTitle}.`;
      } else if (/cierre|proceso|generacion/i.test(lowerTitle)) {
        whatItDoes = `Esta pantalla permite supervisar y ejecutar los procesos operativos de ${lowerTitle}.`;
      } else {
        whatItDoes = `Esta pantalla permite gestionar y consultar la información operativa de ${lowerTitle}.`;
      }
    }

    const searchBtn = actions.find((a) =>
      /consultar|buscar|filtr/i.test(a.name),
    );
    const saveBtn = actions.find((a) =>
      /ingresar|guardar|confirmar|crear/i.test(a.name),
    );
    const detailBtn = actions.find((a) => /agregar|nuevo/i.test(a.name));
    const exportBtn = actions.find((a) => /exportar|descargar/i.test(a.name));

    let howToUse = '';
    if (fields.length > 0 && searchBtn) {
      const sample = fields
        .slice(0, 3)
        .map((f) => f.label)
        .join(', ');
      howToUse = `Para consultar información, ingresa o selecciona los criterios de búsqueda (como ${sample}) y presiona "${searchBtn.name}". Los resultados se listarán en pantalla${exportBtn ? ', desde donde puedes descargarlos mediante "' + exportBtn.name + '"' : ''}.`;
    } else if (fields.length > 0 && saveBtn) {
      const sample = fields
        .slice(0, 3)
        .map((f) => f.label)
        .join(', ');
      howToUse = `Para registrar una operación, completa los parámetros obligatorios del formulario (como ${sample})${detailBtn ? ', añade los ítems necesarios con "' + detailBtn.name + '"' : ''} y finalmente haz clic en "${saveBtn.name}" para procesar y guardar los datos.`;
    } else if (fields.length > 0) {
      const sample = fields
        .slice(0, 3)
        .map((f) => f.label)
        .join(', ');
      howToUse = `Ingresa los valores en los campos correspondientes (${sample}) y utiliza los botones de acción para continuar con el flujo operativo.`;
    } else if (actions.length > 0) {
      howToUse = `Revisa los datos desplegados en la vista y utiliza las opciones disponibles (como ${actions
        .slice(0, 2)
        .map((a) => a.name)
        .join(', ')}) según la operación deseada.`;
    } else {
      howToUse = `Ingresa a la pantalla y revisa la información organizada en las diferentes secciones o paneles.`;
    }

    if (visionResult?.purpose && visionResult.purpose.length > 20) {
      whatItDoes = visionResult.purpose.trim();
    }
    if (visionResult?.howToUse && visionResult.howToUse.length > 20) {
      howToUse = visionResult.howToUse.trim();
    }

    const screenDetail: DetallePantalla = {
      purpose: whatItDoes,
      howToUse,
    };

    const stepByStep: Array<{
      stepNumber: number;
      title: string;
      description: string;
    }> = [];

    if (
      visionResult &&
      visionResult.stepByStep &&
      visionResult.stepByStep.length > 0
    ) {
      stepByStep.push(...visionResult.stepByStep);
    } else {
      if (fields.length > 0) {
        const topLabels = fields
          .slice(0, 3)
          .map((f) => `"${f.label}"`)
          .join(', ');
        stepByStep.push({
          stepNumber: 1,
          title: 'Ingresar parámetros',
          description: `Completa o selecciona los criterios en el formulario (${topLabels}).`,
        });
      } else {
        stepByStep.push({
          stepNumber: 1,
          title: 'Acceder a la pantalla',
          description: `Ingresa a la sección "${seccion.title}" y revisa la vista principal de trabajo.`,
        });
      }

      if (searchBtn) {
        stepByStep.push({
          stepNumber: 2,
          title: 'Ejecutar consulta',
          description: `Haz clic en el botón "${searchBtn.name}" para cargar y listar los registros.`,
        });
      } else if (saveBtn) {
        stepByStep.push({
          stepNumber: 2,
          title: 'Confirmar registro',
          description: `Verifica los valores completados en el formulario y pulsa "${saveBtn.name}" para guardar los cambios.`,
        });
      } else if (actions.length > 0) {
        stepByStep.push({
          stepNumber: 2,
          title: 'Acción en pantalla',
          description: `Utiliza las opciones de acción como "${actions[0].name}" para interactuar con los datos.`,
        });
      } else {
        stepByStep.push({
          stepNumber: 2,
          title: 'Revisar datos',
          description:
            'Verifica el detalle de los registros mostrados en la tabla o panel informativo.',
        });
      }

      if (exportBtn) {
        stepByStep.push({
          stepNumber: 3,
          title: 'Exportar o procesar',
          description: `Revisa los datos obtenidos en la lista y presiona "${exportBtn.name}" si necesitas descargar un archivo de respaldo.`,
        });
      } else {
        stepByStep.push({
          stepNumber: 3,
          title: 'Finalizar',
          description:
            'Comprueba en pantalla que la información se haya actualizado correctamente.',
        });
      }
    }

    const visualElements: ElementoVisualPantalla[] = [];
    if (
      visionResult &&
      visionResult.visualElements &&
      visionResult.visualElements.length > 0
    ) {
      visualElements.push(...visionResult.visualElements);
    } else if (liveDom && liveDom.tables && liveDom.tables.length > 0) {
      for (const tbl of liveDom.tables) {
        const tblName = tbl.title || 'Tabla de registros';
        const colsDesc =
          tbl.columns.length > 0
            ? `Muestra las columnas: ${tbl.columns.join(', ')}.`
            : 'Presenta el listado estructurado de registros en pantalla.';
        visualElements.push({
          name: tblName,
          type: 'Tabla',
          description: `${colsDesc} (${tbl.rowCount} fila(s) cargadas).`.trim(),
        });
      }
    }

    const alerts: string[] = [];
    if (visionResult && visionResult.alerts && visionResult.alerts.length > 0) {
      alerts.push(...visionResult.alerts);
    }

    const tips: string[] = [];
    if (visionResult && visionResult.tips && visionResult.tips.length > 0) {
      tips.push(...visionResult.tips);
    }
    if (liveDom && liveDom.notes.length > 0) {
      tips.push(...liveDom.notes);
    }

    return {
      purpose: whatItDoes,
      screenDetail,
      stepByStep,
      fields,
      actions,
      visualElements: visualElements.slice(0, 8),
      alerts: Array.from(new Set(alerts)).slice(0, 5),
      tips: Array.from(new Set(tips)).slice(0, 5),
    };
  }
}
