export interface FragmentoMarkdown {
  indice: number;
  seccion: string;
  contenido: string;
}

export function dividirMarkdownPorSecciones(
  contenido: string,
): FragmentoMarkdown[] {
  if (!contenido || !contenido.trim()) {
    return [];
  }

  const lineas = contenido.split('\n');
  const fragmentos: FragmentoMarkdown[] = [];

  let seccionActual = 'Introducción / General';
  let bufferLineas: string[] = [];
  let indice = 0;

  for (const linea of lineas) {
    // Detectar encabezados #, ##, ###, etc.
    const matchEncabezado = linea.match(/^(#{1,6})\s+(.*)$/);

    if (matchEncabezado) {
      // Guardar el bloque previo si tiene contenido
      const textoAcumulado = bufferLineas.join('\n').trim();
      if (textoAcumulado.length > 0) {
        fragmentos.push({
          indice: indice++,
          seccion: seccionActual,
          contenido: textoAcumulado,
        });
        bufferLineas = [];
      }

      seccionActual = linea.trim();
      bufferLineas.push(linea);
    } else {
      bufferLineas.push(linea);
    }
  }

  // Guardar el último bloque
  const textoFinal = bufferLineas.join('\n').trim();
  if (textoFinal.length > 0) {
    fragmentos.push({
      indice: indice++,
      seccion: seccionActual,
      contenido: textoFinal,
    });
  }

  return fragmentos;
}
