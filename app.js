/* Diag Pro Eco - appli agences : interface */
(function () {
  'use strict';

  var CONFIG = {
    relais: 'https://script.google.com/macros/s/AKfycbzSHjyqH3vo98HWBVMfYyW6OCS05zVsBnXM26UWiuHmBoPC2pwgv_-ueGvBXWH4u96hsQ/exec',            // adresse du relais Google (Apps Script) qui envoie le mail
    cle: 'dpe-agences-2026',
    delaiDevis: 'dans la journée'
  };
  var VERSION = '1.14';
  var R = window.Regles;

  /* ---------- outils ---------- */
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var LS = {
    get: function (k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage plein ou bloqué */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* rien */ } }
  };
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  var form = $('#form');
  function val(name) { var el = form.elements[name]; return el ? String(el.value || '').trim() : ''; }
  function setVal(name, v) {
    var el = form.elements[name];
    if (!el) return;
    if (el.length !== undefined && el[0] && el[0].type === 'radio') {
      Array.prototype.forEach.call(el, function (r) { r.checked = r.value === v; });
    } else { el.value = v == null ? '' : v; }
  }

  var LIB = {
    projet: { vente: 'Vente', location: 'Location', renovation: 'Rénovation', audit: 'Audit énergétique réglementaire', autre: 'Autre' },
    type: { maison: 'Maison', appartement: 'Appartement', immeuble: 'Immeuble collectif', local: 'Local commercial', bureau: 'Bureau', autre: 'Autre type de bien' },
    copro: { oui: 'En copropriété', non: 'Hors copropriété' },
    construction: { nsp: 'Ne sait pas', avant1949: 'Avant 1949', '1949_1997': 'De 1949 au 1er juillet 1997', apres1997: 'Après le 1er juillet 1997' },
    elec: { nsp: 'Ne sait pas', plus15: 'Plus de 15 ans', moins15: 'Moins de 15 ans', aucune: "Pas d'installation" },
    gaz: { nsp: 'Ne sait pas', plus15: 'Plus de 15 ans', moins15: 'Moins de 15 ans', aucun: 'Pas de gaz' },
    oui3: { oui: 'Oui', non: 'Non', nsp: 'Ne sait pas' },
    dispo: { asap: 'Dès que possible', semaine: 'Cette semaine', prochaine: 'La semaine prochaine', convenir: 'À convenir' },
    devis: { agence: 'Le demandeur', proprio: 'Le propriétaire' },
    qui: { entreprise: 'Entreprise', autre: 'Autre (particulier…)' },
    resultat: {
      amiante: { absence: "Pas d'amiante repéré", presence: 'Amiante repéré' },
      plomb: { absence: 'Pas de plomb au-dessus du seuil', presence: 'Plomb au-dessus du seuil' }
    }
  };
  function lib(groupe, v) { return (LIB[groupe] && LIB[groupe][v]) || ''; }

  var S = {
    step: 1,
    adresse: null,      // adresse choisie dans les suggestions
    existants: {},      // diagnostics existants indiqués dans la demande
    ctxEx: null,        // projet pour lequel la liste des existants a été construite
    coches: {},         // choix faits à la main dans la liste des diagnostics
    liste: [], autres: [], infos: [],
    vctx: 'vente', vexistants: { vente: {}, location: {} },
    envoi: false
  };
  var params = new URLSearchParams(location.search);
  var SOURCE = params.get('src') || 'direct';
  var TEST = params.get('test') === '1';

  /* ---------- réponses et conditions ---------- */
  function reponses() {
    return {
      projet: val('projet'), type: val('type'), copro: val('copro'), construction: val('construction'),
      elec: val('elec'), gaz: val('gaz'), egout: val('egout'), dpeClasse: val('dpeClasse')
    };
  }

  function montrer(sel, oui) { $$(sel).forEach(function (el) { el.hidden = !oui; }); }

  function conditions() {
    majQui();
    var r = reponses();
    var hab = !r.type || ['maison', 'appartement', 'immeuble', 'autre'].indexOf(r.type) !== -1;
    var autre = r.projet === 'autre';   // « Autre » : la personne écrit sa demande
    var libre = autre || r.projet === 'audit';   // « Autre » et « Audit » : pas de liste ni de questions sur les installations
    montrer('[data-si=autre]', autre);
    montrer('[data-si=liste]', !libre);
    montrer('[data-si=egout]', !libre);
    montrer('[data-si=habitation]', hab && !libre);
    montrer('[data-si=piscine]', !libre && ['maison', 'immeuble', 'autre'].indexOf(r.type) !== -1);
    if ($('#lead-recap')) $('#lead-recap').textContent = libre ? 'Vérifiez vos coordonnées.' : 'Vérifiez la liste, puis vos coordonnées.';
    montrer('[data-si=complement]', r.type === 'appartement' || r.copro === 'oui');
    var avecExistants = r.projet === 'vente' || r.projet === 'location';
    montrer('[data-si=recents]', avecExistants);
    montrer('#existants', val('recents') === 'oui' && avecExistants);
    montrer('[data-si=dpe-audit]', r.projet === 'audit');   // audit : juste « Un DPE a-t-il été fait ? », rien d'obligatoire
    montrer('[data-si=email-proprio]', val('devis') === 'proprio');
  }

  /* ---------- secteur ---------- */
  var EXCLUS_INSEE = ['69123', '69266', '69256', '69381', '69382', '69383', '69384', '69385', '69386', '69387', '69388', '69389'];
  var EXCLUS_CP = ['69001', '69002', '69003', '69004', '69005', '69006', '69007', '69008', '69009', '69100', '69120'];
  var DEPTS = ['01', '71', '39', '69'];
  function zone() {
    var cp = val('cp');
    var insee = S.adresse && S.adresse.citycode;
    if (!/^\d{5}$/.test(cp)) return { ok: true };
    if ((insee && EXCLUS_INSEE.indexOf(insee) !== -1) || EXCLUS_CP.indexOf(cp) !== -1) {
      return { ok: false, classe: 'bad', texte: "Nous n'intervenons pas à Lyon, Villeurbanne ni Vaulx-en-Velin. Merci de votre compréhension." };
    }
    if (DEPTS.indexOf(cp.slice(0, 2)) === -1) {
      return { ok: true, classe: 'warn', texte: "Ce bien est hors de notre secteur habituel (Ain, Saône-et-Loire, Jura, Beaujolais). Envoyez quand même la demande : nous vous disons vite si c'est possible." };
    }
    return { ok: true };
  }
  function majZone() {
    var z = zone(), n = $('#zone-note');
    if (z.texte) { n.className = 'note ' + z.classe; n.textContent = z.texte; n.hidden = false; }
    else n.hidden = true;
  }

  /* ---------- adresse qui se complète toute seule (Géoplateforme IGN, gratuite) ---------- */
  function initAdresse() {
    var input = $('#adresse'), liste = $('#ac-liste'), etat = $('#ac-etat');
    var minuteur = null, ctrl = null, items = [], actif = -1;

    input.addEventListener('input', function () {
      S.adresse = null;
      var q = input.value.trim();
      clearTimeout(minuteur);
      if (q.length < 3) { fermer(); return; }
      minuteur = setTimeout(function () { chercher(q); }, 220);
    });
    input.addEventListener('keydown', function (e) {
      if (liste.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); bouger(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); bouger(-1); }
      else if (e.key === 'Enter' && actif >= 0) { e.preventDefault(); choisir(items[actif]); }
      else if (e.key === 'Escape') { fermer(); }
    });
    input.addEventListener('blur', function () { setTimeout(fermer, 200); });

    function chercher(q) {
      if (ctrl) ctrl.abort();
      ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      // 20 résultats, puis ceux du secteur (Ain d'abord) remontés en tête
      var url = 'https://data.geopf.fr/geocodage/search?autocomplete=1&limit=20&lat=46.29&lon=5.16&q=' + encodeURIComponent(q);
      var BONUS = { '01': 0.2, '71': 0.1, '39': 0.1, '69': 0.08 };
      fetch(url, ctrl ? { signal: ctrl.signal } : {})
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (j) {
          items = (j.features || []).map(function (f, i) {
            var p = f.properties || {}, c = (f.geometry && f.geometry.coordinates) || [];
            var dep = String(p.context || '').split(',')[0].trim();
            return { label: p.label, name: p.name, postcode: p.postcode, city: p.city, citycode: p.citycode, context: p.context, type: p.type, lon: c[0], lat: c[1],
              rang: (typeof p.score === 'number' ? p.score : 1 - i / 40) + (BONUS[dep] || 0) };
          }).sort(function (a, b) { return b.rang - a.rang; }).slice(0, 6);
          afficher();
        })
        .catch(function (err) {
          if (err && err.name === 'AbortError') return;
          items = []; fermer();
          etat.textContent = "Suggestions indisponibles pour le moment : saisissez l'adresse à la main.";
        });
    }
    function afficher() {
      liste.innerHTML = ''; actif = -1;
      if (!items.length) { fermer(); etat.textContent = "Aucune adresse trouvée : vérifiez l'orthographe, ou saisissez-la à la main."; return; }
      items.forEach(function (it, i) {
        var li = document.createElement('li');
        li.id = 'ac-' + i;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        var region = it.context ? it.context.split(',').slice(1, 2).join('').trim() : '';
        li.innerHTML = '<b>' + esc(it.type === 'municipality' ? it.city : (it.name || it.label)) + '</b><span>' +
          esc([it.postcode, it.type === 'municipality' ? '' : it.city].filter(Boolean).join(' ') + (region ? ' · ' + region : '')) + '</span>';
        li.addEventListener('mousedown', function (e) { e.preventDefault(); choisir(it); });
        liste.appendChild(li);
      });
      liste.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      etat.textContent = items.length + (items.length > 1 ? ' adresses proposées.' : ' adresse proposée.');
    }
    function bouger(d) {
      var lis = $$('li', liste);
      if (!lis.length) return;
      actif = (actif + d + lis.length) % lis.length;
      lis.forEach(function (li, i) { li.setAttribute('aria-selected', i === actif ? 'true' : 'false'); });
      input.setAttribute('aria-activedescendant', lis[actif].id);
      lis[actif].scrollIntoView({ block: 'nearest' });
    }
    function choisir(it) {
      S.adresse = it;
      var commune = it.type === 'municipality';
      input.value = commune ? '' : (it.name || it.label || '');
      setVal('cp', it.postcode || '');
      setVal('ville', it.city || '');
      fermer();
      etat.textContent = commune ? 'Commune choisie : ajoutez la rue et le numéro.' : 'Adresse choisie. Code postal et ville remplis.';
      if (commune) input.focus();
      $('[data-err=adresse]').hidden = true;
      majZone(); sauver();
    }
    function fermer() {
      liste.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }
    ['cp', 'ville'].forEach(function (n) {
      form.elements[n].addEventListener('input', function () { if (n === 'cp') S.adresse = S.adresse && S.adresse.postcode === val('cp') ? S.adresse : null; majZone(); });
    });
  }

  /* ---------- diagnostics existants (demande et onglet validité) ---------- */
  function construireExistants(conteneur, ctx, store, refFn, surChange) {
    conteneur.innerHTML = '';
    (R.CODES_VALIDITE[ctx] || []).forEach(function (code) {
      var e = store[code] || (store[code] = { on: false, date: '', resultat: '' });
      var id = conteneur.id + '-' + code;
      var resultat = '';
      if (code === 'amiante' || code === 'plomb') {
        resultat = '<fieldset class="ex-resq"><legend class="sr">Résultat du rapport</legend>' +
          ['absence', 'presence'].map(function (k) {
            return '<label class="pill"><input type="radio" name="' + id + '-res" value="' + k + '"' + (e.resultat === k ? ' checked' : '') + '><span>' + esc(LIB.resultat[code][k]) + '</span></label>';
          }).join('') + '</fieldset>';
      }
      var row = document.createElement('div');
      row.className = 'ex-row';
      row.innerHTML =
        '<label class="ck ex-tog"><input type="checkbox"' + (e.on ? ' checked' : '') + '><span class="box" aria-hidden="true"></span>' +
        '<span class="ex-nom">' + esc(R.nom(code, ctx, '')) + (code === 'anc' ? ' <span class="opt">(contrôle SPANC)</span>' : '') + '</span></label>' +
        '<div class="ex-champs"' + (e.on ? '' : ' hidden') + '>' +
        '<label class="lbl" for="' + id + '-date">Date du rapport</label>' +
        '<input type="date" id="' + id + '-date" max="' + R.isoAujourdhui() + '" value="' + esc(e.date) + '">' +
        resultat + '<div class="ex-res" aria-live="polite"></div></div>';
      conteneur.appendChild(row);
      var cb = $('.ex-tog input', row), champs = $('.ex-champs', row), date = $('input[type=date]', row);
      function maj() { majResultat(row, code, ctx, e, refFn()); surChange(); }
      cb.addEventListener('change', function () { e.on = cb.checked; champs.hidden = !cb.checked; maj(); });
      date.addEventListener('change', function () { e.date = date.value; maj(); });
      date.addEventListener('input', function () { e.date = date.value; maj(); });
      $$('input[type=radio]', row).forEach(function (rd) { rd.addEventListener('change', function () { e.resultat = rd.value; maj(); }); });
      majResultat(row, code, ctx, e, refFn());
    });
  }
  function majResultat(row, code, ctx, e, ref) {
    var out = $('.ex-res', row);
    if (!e.on || !e.date) { out.className = 'ex-res'; out.innerHTML = ''; return; }
    var v = R.validite(code, ctx, e, ref);
    out.className = 'ex-res ' + v.etat;
    out.innerHTML = '<p class="ex-txt">' + esc(v.texte) + '</p>' +
      (v.detail ? '<p class="ex-det">' + esc(v.detail) + '</p>' : '') +
      (v.note ? '<p class="ex-note">' + esc(v.note) + '</p>' : '');
  }

  /* ---------- liste des diagnostics à prévoir ---------- */
  var BADGES = { oblig: ['b-oblig', 'Obligatoire'], confirm: ['b-confirm', 'À confirmer'], cond: ['b-cond', 'Selon le cas'], valide: ['b-valide', 'Encore valable'] };
  function estCoche(it) { return Object.prototype.hasOwnProperty.call(S.coches, it.code) ? S.coches[it.code] : (it.statut === 'oblig' || it.statut === 'confirm'); }
  function rendreListe() {
    var r = reponses();
    var res = R.aPrevoir(r);
    S.liste = R.fusion(res.liste, S.existants, r.projet, R.aujourdhui());
    S.infos = res.infos;
    var c = $('#aprevoir');
    c.innerHTML = '';
    S.liste.forEach(function (it) { c.appendChild(ligne(it)); });
    S.autres = (R.CATALOGUE[r.projet] || []).filter(function (code) {
      if ((code === 'audit' || code === 'audit_renov') && r.type !== 'maison') return false;   // audit : maison seulement
      return !S.liste.some(function (i) { return i.code === code; });
    }).map(function (code) { return { code: code, nom: R.nom(code, r.projet, r.copro), statut: 'ajout', raison: 'Ajouté par vous' }; });
    var ca = $('#autres');
    ca.innerHTML = '';
    S.autres.forEach(function (it) { ca.appendChild(ligne(it)); });
    $('#autres-bloc').hidden = !S.autres.length;
    $('#infos').innerHTML = res.infos.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
  }
  function ligne(it) {
    var lab = document.createElement('label');
    lab.className = 'ck dg';
    var b = BADGES[it.statut];
    var v = it.validite && it.validite.texte ? '<span class="dg-val ' + it.validite.etat + '">' + esc(it.validite.texte) + '</span>' : '';
    lab.innerHTML = '<input type="checkbox"' + (estCoche(it) ? ' checked' : '') + '><span class="box" aria-hidden="true"></span>' +
      '<span class="dg-tx"><span class="dg-nom">' + esc(it.nom) + (b ? ' <span class="badge ' + b[0] + '">' + b[1] + '</span>' : '') + '</span>' +
      '<span class="dg-raison">' + esc(it.raison) + '</span>' + v + '</span>';
    $('input', lab).addEventListener('change', function (ev) {
      S.coches[it.code] = ev.target.checked;
      if (ev.target.checked) $('[data-err=liste]').hidden = true;
      sauver();
    });
    return lab;
  }
  function diagnosticsCoches() { return S.liste.concat(S.autres).filter(estCoche); }

  /* ---------- étapes ---------- */
  var TITRES = ['', 'Votre besoin', 'Le bien', 'Descriptif', 'Récapitulatif'];
  function allerA(n, sansDefiler) {
    S.step = n;
    $$('.step').forEach(function (s) { s.hidden = +s.getAttribute('data-step') !== n; });
    $('#prog-tit').textContent = TITRES[n];
    $('#prog-num').textContent = 'Étape ' + n + ' sur 4';
    $('#prog-fill').style.width = (n * 25) + '%';
    $('#btn-retour').hidden = n === 1;
    $('#btn-suivant').textContent = n === 4 ? 'Envoyer la demande' : 'Continuer';
    if (n === 3) preparerExistants();
    if (n === 4) rendreListe();
    conditions();
    if (!sansDefiler) {
      window.scrollTo(0, 0);
      var h = $('.step[data-step="' + n + '"] .h1');
      if (h) try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); }
    }
    sauver();
  }
  // Diagnostics déjà faits : l'audit réglementaire se fait pour une vente, on reprend la liste de la vente
  function ctxExistants(p) { return p === 'audit' ? 'vente' : p; }
  function preparerExistants() {
    var p = ctxExistants(val('projet'));
    if (S.ctxEx === p) return;
    S.ctxEx = p;
    if (p === 'vente' || p === 'location') construireExistants($('#ex-liste'), p, S.existants, R.aujourdhui, sauver);
    else $('#ex-liste').innerHTML = '';
  }

  function effacerErreurs() { $$('[data-err]').forEach(function (p) { p.hidden = true; }); }
  function valider(n) {
    effacerErreurs();
    var err = [];
    if (n === 1 && !val('projet')) err.push('projet');
    if (n === 1 && val('projet') === 'autre' && !val('autreDemande')) err.push('autreDemande');
    if (n === 2) {
      if (!val('type')) err.push('type');
      if (!val('adresse') || !/^\d{5}$/.test(val('cp')) || !val('ville')) err.push('adresse');
      if (!val('copro')) err.push('copro');
    }
    if (n === 3 && !val('construction')) err.push('construction');
    if (n === 4) {
      if (['autre', 'audit'].indexOf(val('projet')) === -1 && !diagnosticsCoches().length) err.push('liste');
      if (!val('agence')) err.push('agence');
      if (!EMAIL_RE.test(val('email'))) err.push('email');
      if (val('tel').replace(/\D/g, '').length < 10) err.push('tel');
      if (val('devis') === 'proprio' && val('emailProprio') && !EMAIL_RE.test(val('emailProprio'))) err.push('emailProprio');
    }
    err.forEach(function (k) { var p = $('[data-err="' + k + '"]'); if (p) p.hidden = false; });
    if (['agence', 'email', 'tel'].some(function (k) { return err.indexOf(k) !== -1; })) ouvrirMoi();
    var bloque = n === 2 && !zone().ok;
    if (err.length || bloque) {
      var cible = err.length ? $('[data-err="' + err[0] + '"]') : $('#zone-note');
      var bloc = cible && (cible.closest('fieldset') || cible.closest('.field') || cible.closest('.q') || cible.closest('.card') || cible);
      if (bloc && bloc.scrollIntoView) bloc.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return false;
    }
    return true;
  }
  function suivant() {
    if (S.step < 4) { if (valider(S.step)) allerA(S.step + 1); }
    else envoyer();
  }

  /* ---------- envoi ---------- */
  function construire() {
    var r = reponses();
    var a = S.adresse || {};
    var coches = diagnosticsCoches();
    var nonRetenus = S.liste.filter(function (it) { return !estCoche(it); });
    var existants = [];
    if (val('recents') === 'oui' && (r.projet === 'vente' || r.projet === 'location')) {
      var cx = ctxExistants(r.projet);
      (R.CODES_VALIDITE[cx] || []).forEach(function (code) {
        var e = S.existants[code];
        if (!e || !e.on || !e.date) return;
        var v = R.validite(code, cx, e, R.aujourdhui());
        existants.push({
          nom: R.nom(code, cx, r.copro), date: R.fmtIso(e.date),
          resultat: (LIB.resultat[code] && LIB.resultat[code][e.resultat]) || '', validite: v.texte || ''
        });
      });
    }
    return {
      v: 1, k: CONFIG.cle, hp: $('#site').value, test: TEST, src: SOURCE, appli: VERSION,
      envoyeLe: new Date().toISOString(),
      projet: lib('projet', r.projet), type: lib('type', r.type), copro: lib('copro', r.copro),
      adresse: {
        ligne: val('adresse'), complement: val('complement'), cp: val('cp'), ville: val('ville'),
        insee: a.citycode || '', lat: a.lat || '', lon: a.lon || '', verifiee: !!S.adresse
      },
      construction: lib('construction', r.construction), pieces: val('pieces'), surface: val('surface'), dependances: val('dependances'),
      elec: lib('elec', r.elec), gaz: lib('gaz', r.gaz), egout: lib('oui3', r.egout), piscine: lib('oui3', val('piscine')),
      dpeClasse: r.dpeClasse === 'nsp' ? 'Ne sait pas' : r.dpeClasse,
      diagnostics: r.projet === 'autre' ? [{ nom: val('autreDemande'), raison: '', statut: 'oblig' }]
        : r.projet === 'audit' ? [{ nom: 'Audit énergétique réglementaire', raison: 'DPE fait depuis le 1er juillet 2021 : ' + (lib('oui3', val('dpeFait')) || 'non indiqué'), statut: 'oblig' }]
        : coches.map(function (it) { return { nom: it.nom, raison: it.raison, statut: it.statut }; }),
      nonRetenus: (r.projet === 'autre' || r.projet === 'audit') ? [] : nonRetenus.map(function (it) { return { nom: it.nom, raison: it.raison, statut: it.statut }; }),
      existants: existants, infos: S.infos,
      agence: { nom: val('agence') + (val('qui') === 'autre' ? ' (particulier / autre)' : ''), qui: lib('qui', val('qui')), contact: val('contact'), email: val('email'), tel: val('tel') },
      visite: { proprietaire: val('proprio'), telProprietaire: val('telProprio'), cles: lib('oui3', val('cles')), dispo: lib('dispo', val('dispo')) },
      devisAuNom: lib('devis', val('devis')), emailProprietaire: val('devis') === 'proprio' ? val('emailProprio') : '',
      message: val('message')
    };
  }

  function poster(p) {
    if (!/^https:\/\//.test(CONFIG.relais)) return Promise.reject(new Error('relais'));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, 30000);
    return fetch(CONFIG.relais, { method: 'POST', body: JSON.stringify(p), redirect: 'follow', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(t); return r.json(); }, function (e) { clearTimeout(t); e.reseau = true; throw e; });
  }

  function envoyer() {
    if (S.envoi || !valider(4)) return;
    var p = construire();
    p.id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    memoriserAgence();
    S.envoi = true;
    var btn = $('#btn-suivant');
    btn.disabled = true; btn.textContent = 'Envoi en cours…';
    $('#envoi-erreur').hidden = true;
    poster(p).then(function (rep) {
      if (rep && rep.ok) { ajouterHistorique(p, rep.ref, 'Envoyée'); effacerBrouillon(); succes(p, false); }
      else erreurEnvoi(rep && rep.erreur);
    }).catch(function (e) {
      if (e && (e.reseau || e.name === 'AbortError')) {
        mettreEnAttente(p); ajouterHistorique(p, '', 'En attente'); effacerBrouillon(); succes(p, true);
      } else erreurEnvoi('serveur');
    }).then(function () {
      S.envoi = false; btn.disabled = false; btn.textContent = 'Envoyer la demande';
    });
  }
  function erreurEnvoi(code) {
    var msg = {
      email: "L'adresse mail a été refusée : vérifiez-la.",
      limite: "Beaucoup de demandes sont parties de cette adresse en une heure. Appelez-nous au 06 51 13 87 82, on s'en occupe."
    }[code] || "La demande n'a pas pu partir. Réessayez dans un instant, ou appelez-nous au 06 51 13 87 82.";
    var n = $('#envoi-erreur');
    n.textContent = msg; n.hidden = false;
    n.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function mettreEnAttente(p) { var q = LS.get('dpe_attente', []); q.push(p); LS.set('dpe_attente', q); majBandeauAttente(); }
  function viderAttente() {
    var q = LS.get('dpe_attente', []);
    if (!q.length || (navigator.onLine === false)) { majBandeauAttente(); return; }
    var p = q[0];
    poster(p).then(function (rep) {
      if (rep && (rep.ok || rep.erreur === 'email' || rep.erreur === 'cle')) {
        q = LS.get('dpe_attente', []).filter(function (x) { return x.id !== p.id; });
        LS.set('dpe_attente', q);
        if (rep.ok) majHistorique(p.id, rep.ref, 'Envoyée');
        majBandeauAttente();
        if (q.length) setTimeout(viderAttente, 1500);
      }
    }).catch(function () { majBandeauAttente(); });
  }
  function majBandeauAttente() {
    var n = LS.get('dpe_attente', []).length, b = $('#bandeau-attente');
    b.hidden = !n;
    b.textContent = n ? (n > 1 ? n + ' demandes attendent' : '1 demande attend') + " le réseau : elle partira toute seule dès qu'il revient." : '';
  }

  /* ---------- historique (sur cet appareil) ---------- */
  function ajouterHistorique(p, ref, statut) {
    var h = LS.get('dpe_historique', []);
    h.unshift({ id: p.id, ref: ref || '', date: new Date().toISOString(), adresse: [p.adresse.ligne, p.adresse.ville].filter(Boolean).join(', '), projet: p.projet, statut: statut });
    LS.set('dpe_historique', h.slice(0, 15));
    rendreHistorique();
  }
  function majHistorique(id, ref, statut) {
    var h = LS.get('dpe_historique', []);
    h.forEach(function (x) { if (x.id === id) { x.ref = ref || x.ref; x.statut = statut; } });
    LS.set('dpe_historique', h);
    rendreHistorique();
  }
  function rendreHistorique() {
    var h = LS.get('dpe_historique', []);
    $('#historique').hidden = !h.length;
    $('#hist-liste').innerHTML = h.map(function (x) {
      var d = new Date(x.date);
      return '<li><span>' + esc(x.projet + ' · ' + x.adresse) + '</span><span>' + esc(d.toLocaleDateString('fr-FR') + ' · ' + x.statut) + '</span></li>';
    }).join('');
  }

  /* ---------- écran de fin ---------- */
  function succes(p, attente) {
    form.hidden = true; $('#progress').hidden = true; $('#bar').hidden = true;
    $('#succes').hidden = false;
    $('#succes-titre').textContent = attente ? 'Demande enregistrée' : 'Demande envoyée';
    $('#succes-texte').innerHTML = attente
      ? "Pas de réseau pour le moment : la demande partira toute seule dès qu'il revient, à la prochaine ouverture de l'appli."
      : 'Geoffrey vous envoie le devis <b>' + esc(CONFIG.delaiDevis) + '</b>.';
    $('#recap').innerHTML =
      '<p><b>' + esc(p.projet + ' · ' + p.type) + '</b></p>' +
      '<p>' + esc([p.adresse.ligne, p.adresse.complement, p.adresse.cp + ' ' + p.adresse.ville].filter(Boolean).join(', ')) + '</p>' +
      '<ul>' + p.diagnostics.map(function (d) { return '<li>' + esc(d.nom) + '</li>'; }).join('') + '</ul>';
    window.scrollTo(0, 0);
    try { $('#succes-titre').focus({ preventScroll: true }); } catch (e) { /* rien */ }
  }
  function nouvelle() {
    var garder = {};
    ['qui', 'agence', 'contact', 'email', 'tel'].forEach(function (k) { garder[k] = val(k); });
    form.reset();
    Object.keys(garder).forEach(function (k) { setVal(k, garder[k]); });
    $('#memo').checked = true;
    S.adresse = null; S.existants = {}; S.ctxEx = null; S.coches = {};
    $('#zone-note').hidden = true;
    $('#ac-etat').textContent = "Commencez à taper : les adresses s'affichent.";
    $('#succes').hidden = true; form.hidden = false; $('#progress').hidden = false; $('#bar').hidden = false;
    majQui(); afficherMoi();
    allerA(1);
  }

  /* ---------- agence mémorisée ---------- */
  function memoriserAgence() {
    if ($('#memo').checked) LS.set('dpe_agence', { qui: val('qui'), agence: val('agence'), contact: val('contact'), email: val('email'), tel: val('tel') });
    else LS.del('dpe_agence');
  }
  function chargerAgence() {
    var a = LS.get('dpe_agence', null);
    if (a) ['qui', 'agence', 'contact', 'email', 'tel'].forEach(function (k) { setVal(k, a[k] || ''); });
    majQui();
    afficherMoi();
  }
  function afficherMoi() {
    var a = LS.get('dpe_agence', null);
    if (a && a.email && a.agence) {
      $('#moi-texte').innerHTML = '<b>' + esc(a.agence) + '</b><br>' + esc([a.contact, a.email, a.tel].filter(Boolean).join(' · '));
      $('#moi').hidden = false; $('#moi-champs').hidden = true;
    } else { $('#moi').hidden = true; $('#moi-champs').hidden = false; }
  }
  function majQui() {
    var autre = val('qui') === 'autre';
    $('#lbl-nom').textContent = val('qui') === 'entreprise' ? "Nom de l'entreprise" : (autre ? 'Votre nom' : 'Nom');
    $('#bloc-contact').hidden = autre;
    $('#agence').setAttribute('autocomplete', autre ? 'name' : 'organization');
  }
  function ouvrirMoi() { $('#moi').hidden = true; $('#moi-champs').hidden = false; }

  /* ---------- brouillon ---------- */
  var tSauve = null;
  function champsBrouillon() {
    var o = {};
    $$('input, textarea', form).forEach(function (el) {
      if (!el.name || el.name === 'site') return;   // tout est gardé (coordonnées de l'agence comprises), sauf le piège à robots
      if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
      else if (el.type !== 'checkbox') o[el.name] = el.value;
    });
    return o;
  }
  function sauver() {
    clearTimeout(tSauve);
    tSauve = setTimeout(function () {
      var c = champsBrouillon();
      if (!c.projet && !c.adresse) return;
      LS.set('dpe_brouillon', { t: Date.now(), champs: c, existants: S.existants, coches: S.coches, adresse: S.adresse, step: S.step });
    }, 300);
  }
  function effacerBrouillon() { clearTimeout(tSauve); LS.del('dpe_brouillon'); }
  function proposerBrouillon() {
    var b = LS.get('dpe_brouillon', null);
    if (!b || !b.champs || Date.now() - b.t > 7 * 86400000) { effacerBrouillon(); return; }
    var quoi = [lib('projet', b.champs.projet), [b.champs.adresse, b.champs.ville].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
    $('#brouillon-texte').textContent = 'Une demande était en cours' + (quoi ? ' : ' + quoi : '') + '.';
    $('#bandeau-brouillon').hidden = false;
    $('#brouillon-oui').onclick = function () {
      Object.keys(b.champs).forEach(function (k) { setVal(k, b.champs[k]); });
      S.existants = b.existants || {}; S.coches = b.coches || {}; S.adresse = b.adresse || null; S.ctxEx = null;
      $('#bandeau-brouillon').hidden = true;
      majZone();
      allerA(Math.min(Math.max(+b.step || 1, 1), 4));
    };
    $('#brouillon-non').onclick = function () { effacerBrouillon(); $('#bandeau-brouillon').hidden = true; };
  }

  /* ---------- onglets ---------- */
  function onglet(nom) {
    var devis = nom !== 'validite';
    $('#tab-devis').setAttribute('aria-selected', devis ? 'true' : 'false');
    $('#tab-validite').setAttribute('aria-selected', devis ? 'false' : 'true');
    $('#vue-devis').hidden = !devis;
    $('#vue-validite').hidden = devis;
    $('#bar').hidden = !devis || !$('#succes').hidden;
    try { history.replaceState(null, '', location.pathname + location.search + (devis ? '' : '#validite')); } catch (e) { /* rien */ }
    window.scrollTo(0, 0);
  }

  /* ---------- onglet validité ---------- */
  function refValidite() { return R.parseDate($('#v-signature').value) || R.aujourdhui(); }
  function construireValidite() {
    construireExistants($('#v-liste'), S.vctx, S.vexistants[S.vctx], refValidite, majBoutonValidite);
    majBoutonValidite();
  }
  function aRefaire() {
    var store = S.vexistants[S.vctx], ref = refValidite();
    return Object.keys(store).filter(function (code) {
      var e = store[code];
      return e.on && e.date && R.validite(code, S.vctx, e, ref).etat === 'perime';
    });
  }
  function majBoutonValidite() {
    var n = aRefaire().length, b = $('#v-devis');
    b.hidden = !n;
    b.textContent = n > 1 ? 'Demander un devis pour les ' + n + ' diagnostics à refaire' : 'Demander un devis pour le diagnostic à refaire';
  }
  function initValidite() {
    $$('input[name=vctx]').forEach(function (rd) {
      rd.addEventListener('change', function () { S.vctx = rd.value; construireValidite(); });
    });
    $('#v-signature').addEventListener('change', construireValidite);
    $('#v-devis').addEventListener('click', function () {
      var copie = JSON.parse(JSON.stringify(S.vexistants[S.vctx]));
      setVal('projet', S.vctx);
      setVal('recents', 'oui');
      S.existants = copie; S.ctxEx = null; S.coches = {};
      onglet('devis');
      if (!$('#succes').hidden) { $('#succes').hidden = true; form.hidden = false; $('#progress').hidden = false; $('#bar').hidden = false; }
      allerA(2);
    });
    $('#sources-date').textContent = 'Règles vérifiées le ' + R.VERIFIE_LE + ' sur les sites officiels. Le diagnostiqueur confirme toujours la liste dans le devis.';
    $('#sources').innerHTML = R.SOURCES.map(function (s) {
      return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.titre) + '</a></li>';
    }).join('');
    construireValidite();
  }

  /* ---------- garder l'appli sur le téléphone ou l'ordinateur ---------- */
  var invite = null;
  var INSTALLEE = window.navigator.standalone === true ||
    !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  var IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var ANDROID = /android/i.test(navigator.userAgent);
  function bandeauInstall(texte, bouton) {
    if (!$('#bandeau-installer')) return;   // ancienne page encore en cache : pas de bandeau
    var non = +LS.get('dpe_install_non', 0);
    if (INSTALLEE || (non && Date.now() - non < 30 * 86400000)) return;   // « Plus tard » : on ne redemande pas avant 30 jours
    $('#inst-texte').textContent = texte;
    $('#inst-oui').hidden = !bouton;
    $('#bandeau-installer').hidden = false;
  }
  function cacherInstall() {
    invite = null;
    if ($('#bandeau-installer')) $('#bandeau-installer').hidden = true;
    $$('.js-installer').forEach(function (b) { b.hidden = true; });
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); invite = e;
    $$('.js-installer').forEach(function (b) { b.hidden = false; });
    bandeauInstall("Un clic sur « Installer l'appli » : elle se met sur votre écran et s'ouvre ensuite d'un geste.", true);
  });
  window.addEventListener('appinstalled', function () { INSTALLEE = true; cacherInstall(); });
  function installer() {
    if (!invite) return;
    invite.prompt();
    invite.userChoice.then(cacherInstall, cacherInstall);
  }

  /* ---------- partager l'appli avec un collègue ---------- */
  var LIEN_APPLI = 'https://diagproeco.github.io/agences/';
  var TEXTE_PARTAGE = "L'appli DIAG PRO ECO pour demander un devis de diagnostics, devis dans la journée :";
  var tToast = null;
  function toast(msg) {
    var t = $('#toast'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(tToast); tToast = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function montrerLien() {
    var i = $('#partage-lien'); if (!i) return;
    i.hidden = false; i.focus(); i.select();
    toast('Copiez le lien affiché sous le bouton.');
  }
  function copierLien() {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(TEXTE_PARTAGE + ' ' + LIEN_APPLI)
        .then(function () { toast('Copié : collez-le dans un mail ou un message.'); }, montrerLien);
    } else montrerLien();
  }
  function partager() {
    // Téléphone : la fenêtre de partage (SMS, WhatsApp, mail…) ; ordinateur : le lien est copié
    if (navigator.share && (IOS || ANDROID)) {
      navigator.share({ title: 'Diag Pro Eco – Devis agences', text: TEXTE_PARTAGE, url: LIEN_APPLI })
        .catch(function (e) { if (!e || e.name !== 'AbortError') copierLien(); });
    } else copierLien();
  }

  /* ---------- envoyer des rapports récents : mail tout prêt, la personne joint ses fichiers ---------- */
  var MAIL_RAPPORTS = 'diagproeco@gmail.com';
  function mailRapports(source) {
    var ctx = source === 'validite' ? S.vctx : ctxExistants(val('projet'));
    var store = (source === 'validite' ? S.vexistants[S.vctx] : S.existants) || {};
    var adresse = source === 'validite' ? '' : [val('adresse'), (val('cp') + ' ' + val('ville')).trim()].filter(Boolean).join(', ');
    var lignes = (R.CODES_VALIDITE[ctx] || []).filter(function (code) { return store[code] && store[code].on; }).map(function (code) {
      return '- ' + R.nom(code, ctx, '') + (store[code].date ? ' du ' + R.fmtIso(store[code].date) : '');
    });
    var sujet = 'Rapports récents' + (adresse ? ' – ' + adresse : '');
    var corps = 'Bonjour Geoffrey,\n\nVoici mes rapports récents' + (adresse ? ' pour le bien : ' + adresse : '') + '.\n' +
      (lignes.length ? '\n' + lignes.join('\n') + '\n' : '') + '\n(Pensez à joindre vos rapports, PDF ou photos.)\n';
    return 'mailto:' + MAIL_RAPPORTS + '?subject=' + encodeURIComponent(sujet) + '&body=' + encodeURIComponent(corps);
  }

  /* ---------- partage réservé à Geoffrey et sa femme ---------- */
  // Le bouton « Partager » n'apparaît que sur les appareils activés : lien perso ?equipe=CODE ouvert une fois,
  // ou 5 touches rapides sur le logo puis le code (utile sur iPhone, où l'appli installée a sa propre mémoire).
  // ?equipe=non retire le bouton de l'appareil.
  var CODE_EQUIPE = '1437';
  function estEquipe() { return LS.get('dpe_equipe', false) === true; }
  function majEquipe() { var on = estEquipe(); $$('.js-equipe').forEach(function (el) { el.hidden = !on; }); }
  function activerEquipe(code) {
    if (String(code == null ? '' : code).trim() !== CODE_EQUIPE) return false;
    LS.set('dpe_equipe', true); majEquipe(); toast('Bouton Partager activé sur cet appareil.');
    return true;
  }
  function lienEquipe() {
    var c = params.get('equipe');
    if (c === null) return;
    if (c === 'non') { LS.del('dpe_equipe'); majEquipe(); toast('Bouton Partager retiré de cet appareil.'); }
    else activerEquipe(c);
    params.delete('equipe');   // le code ne reste pas dans la barre d'adresse
    var q = params.toString();
    try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch (e) { /* rien */ }
  }
  function toucherLogo() {
    var logo = $('.top img'); if (!logo) return;
    var n = 0, t = null;
    logo.addEventListener('click', function () {
      n++; clearTimeout(t); t = setTimeout(function () { n = 0; }, 1500);
      if (n < 5) return;
      n = 0;
      if (estEquipe()) { toast('Le bouton Partager est déjà activé sur cet appareil.'); return; }
      var c = window.prompt('Code');
      if (c !== null && !activerEquipe(c)) toast('Code incorrect.');
    });
  }

  /* ---------- démarrage ---------- */
  function init() {
    initAdresse();
    initValidite();
    chargerAgence();
    rendreHistorique();
    majBandeauAttente();

    form.addEventListener('submit', function (e) { e.preventDefault(); suivant(); });
    form.addEventListener('change', function (e) {
      var n = e.target.name;
      if (n === 'type' && e.target.value === 'appartement' && !val('copro')) setVal('copro', 'oui');
      if (n === 'projet') { S.coches = {}; $('[data-err=projet]').hidden = true; }
      if (e.target.type === 'radio' && n) { var p = $('[data-err="' + n + '"]'); if (p) p.hidden = true; }
      conditions(); sauver();
      if (n === 'projet' && S.step === 1 && e.isTrusted && e.target.value !== 'autre') setTimeout(function () { if (S.step === 1 && val('projet') && val('projet') !== 'autre') allerA(2); }, 260);
      if (n === 'projet' && e.target.value === 'autre' && e.isTrusted) setTimeout(function () { try { $('#autreDemande').focus(); } catch (x) { /* rien */ } }, 60);
    });
    form.addEventListener('input', sauver);
    $('#btn-suivant').addEventListener('click', suivant);
    $('#btn-retour').addEventListener('click', function () { if (S.step > 1) allerA(S.step - 1); });
    $('#nouvelle').addEventListener('click', nouvelle);
    $('#moi-modifier').addEventListener('click', ouvrirMoi);
    $('#tab-devis').addEventListener('click', function () { onglet('devis'); });
    $('#tab-validite').addEventListener('click', function () { onglet('validite'); });
    $$('.js-installer').forEach(function (b) { b.addEventListener('click', installer); });
    $$('.js-partager').forEach(function (b) { b.addEventListener('click', partager); });
    $$('.js-rapports').forEach(function (a) { a.addEventListener('click', function () { a.href = mailRapports(a.getAttribute('data-src')); }); });
    lienEquipe(); majEquipe(); toucherLogo();
    $$('[data-pas]').forEach(function (b) {
      b.addEventListener('click', function () {
        var n = Math.max(0, Math.min(60, (parseInt(val('pieces'), 10) || 0) + parseInt(b.getAttribute('data-pas'), 10)));
        setVal('pieces', n); sauver();
      });
    });
    if ($('#inst-non')) $('#inst-non').addEventListener('click', function () { LS.set('dpe_install_non', Date.now()); $('#bandeau-installer').hidden = true; });
    if (IOS && !INSTALLEE) {
      $('#install-ios').hidden = false;
      bandeauInstall("Dans Safari, touchez Partager (le carré avec une flèche), puis « Sur l'écran d'accueil ».", false);
    } else if (ANDROID && !INSTALLEE) {
      // Si Chrome ne propose pas encore l'installation, on explique comment faire à la main
      setTimeout(function () { if (!invite && !INSTALLEE) bandeauInstall("Dans Chrome, touchez le menu ⋮ puis « Ajouter à l'écran d'accueil ».", false); }, 3000);
    }
    window.addEventListener('online', viderAttente);

    conditions();
    allerA(1, true);
    proposerBrouillon();
    if (location.hash === '#validite') onglet('validite');
    viderAttente();

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* rien */ }); });
    }
  }
  init();
})();
