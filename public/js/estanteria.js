// js/estanteria.js — Modo estantería
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

// ══════════════════════════════════════════════════════════
// MODO ESTANTERÍA
// ══════════════════════════════════════════════════════════
(function () {
 
  var COLORES_LOMO = [
    '#8B6355','#7A8B6E','#6E7A8B','#8B7A6E',
    '#6E8B7A','#8B6E7A','#7A6E8B','#8B8B6E',
    '#6E8B8B','#8B7A8B','#6E7A6E','#8B8B8B',
  ];
 
  function colorLomo(titulo) {
    var hash = 0;
    for (var i = 0; i < (titulo || '').length; i++) {
      hash = ((hash << 5) - hash) + (titulo || '').charCodeAt(i);
    }
    return COLORES_LOMO[Math.abs(hash) % COLORES_LOMO.length];
  }
 
  window.renderEstanteria = function(ejemplares) {
    var contenedor = document.getElementById('ejemplares-estanteria');
    if (!contenedor) return;
 
    if (!ejemplares || !ejemplares.length) {
      contenedor.innerHTML = '<p class="muted" style="padding:16px;">Sin ejemplares que mostrar.</p>';
      return;
    }
 
    contenedor.innerHTML = ejemplares.map(function(e) {
      var titulo   = e.titulo  || 'Sin título';
      var autores  = e.autores || '';
      var color    = colorLomo(titulo);
      var tEsc     = escapeHtml(titulo);
      var tooltip  = tEsc + (autores ? ' — ' + escapeHtml(autores) : '');
      var autorCorto = autores ? escapeHtml(autores.split(',')[0].trim()) : '';
 
      if (e.url_portada) {
        var src = srcPortada(e.url_portada);
        return '<div class="lomo lomo--portada"' +
               ' data-libro-id="' + e.libro_id + '"' +
               ' data-ejemplar-id="' + e.ejemplar_id + '"' +
               ' title="' + tooltip + '">' +
               '<img src="' + src + '" alt="' + tEsc + '" class="lomo-portada-img" loading="lazy" decoding="async" />' +
               '</div>';
      }
 
      return '<div class="lomo lomo--color"' +
             ' data-libro-id="' + e.libro_id + '"' +
             ' data-ejemplar-id="' + e.ejemplar_id + '"' +
             ' style="--lomo-color:' + color + ';"' +
             ' title="' + tooltip + '">' +
             '<span class="lomo-titulo">' + tEsc + '</span>' +
             (autorCorto ? '<span class="lomo-autor">' + autorCorto + '</span>' : '') +
             '</div>';
    }).join('');
  };
 
  document.addEventListener('DOMContentLoaded', function() {
    var cont = document.getElementById('ejemplares-estanteria');
    if (cont) {
      cont.addEventListener('click', function(e) {
        var lomo = e.target.closest('.lomo');
        if (!lomo) return;
        mostrarFicha(lomo.dataset.libroId, lomo.dataset.ejemplarId);
      });
    }
  });
 
})();
