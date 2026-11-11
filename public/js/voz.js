// js/voz.js — Búsqueda por voz (Web Speech API)
// (El servidor une todos los ficheros de js/ en /main.js según js/orden.json)

// ══════════════════════════════════════════════════════════
// BÚSQUEDA POR VOZ — Web Speech API
// ══════════════════════════════════════════════════════════
(function () {
 
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
 
  if (!SpeechRecognition) {
    document.addEventListener('DOMContentLoaded', function() {
      var btn = document.getElementById('btn-voz');
      if (btn) btn.style.display = 'none';
    });
    return;
  }
 
  var recognition = null;
  var escuchando  = false;
 
  function iniciarVoz() {
    if (escuchando) { pararVoz(); return; }
 
    // Solicitar permiso de micrófono explícitamente primero
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function(stream) {
        // Liberar el stream inmediatamente — solo era para obtener permiso
        stream.getTracks().forEach(function(t) { t.stop(); });
        arrancarReconocimiento();
      })
      .catch(function(err) {
        console.warn('[voz] Permiso denegado:', err);
        var input = document.getElementById('buscador-ejemplares');
        if (input) {
          input.placeholder = 'Permiso de micrófono denegado';
          setTimeout(function() {
            input.placeholder = 'Buscar por título, autor, ISBN, notas.';
          }, 3000);
        }
      });
  }
 
  function arrancarReconocimiento() {
    recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
 
    var btn   = document.getElementById('btn-voz');
    var input = document.getElementById('buscador-ejemplares');
 
    recognition.onstart = function() {
      escuchando = true;
      if (btn) {
        btn.classList.add('btn-voz--activo');
        btn.title = 'Escuchando… (pulsa para parar)';
        btn.querySelector('.icon-circle').innerHTML = icono('stop');
      }
      if (input) {
        input.value = '';
        input.placeholder = 'Escuchando…';
      }
    };
 
    recognition.onresult = function(e) {
      var transcripcion = e.results[0][0].transcript;
      if (input) {
        input.value = transcripcion;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
 
    recognition.onend = function() { pararVoz(); };
 
    recognition.onerror = function(e) {
      console.warn('[voz] Error:', e.error);
      pararVoz();
    };
 
    recognition.start();
  }
 
  function pararVoz() {
    escuchando = false;
    if (recognition) {
      try { recognition.stop(); } catch(e) {}
      recognition = null;
    }
    var btn   = document.getElementById('btn-voz');
    var input = document.getElementById('buscador-ejemplares');
    if (btn) {
      btn.classList.remove('btn-voz--activo');
      btn.title = 'Buscar por voz';
      btn.querySelector('.icon-circle').innerHTML = icono('micro');
    }
    if (input && input.placeholder === 'Escuchando…') {
      input.placeholder = 'Buscar por título, autor, ISBN, notas.';
    }
  }
 
  document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('btn-voz').addEventListener('click', iniciarVoz);
    document.getElementById('buscador-ejemplares').addEventListener('keydown', function() {
      if (escuchando) pararVoz();
    });
  });
 
})();
