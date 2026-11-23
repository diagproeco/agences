/* Diag Pro Eco - appli agences
 * Règles des diagnostics : lesquels prévoir, et jusqu'à quand ils sont valables.
 * Vérifiées le 22/11/2026 sur service-public.gouv.fr, ecologie.gouv.fr, economie.gouv.fr,
 * Légifrance, l'INC et notaires.fr (liens dans SOURCES, en bas de ce fichier).
 */
(function (global) {
  'use strict';

  var JOUR = 86400000;
  var VERIFIE_LE = '22/11/2026';

  var NOMS = {
    dpe: 'DPE (performance énergétique)',
    audit: 'Audit énergétique',
    amiante: 'Amiante',
    plomb: 'Plomb (CREP)',
    elec: 'Électricité',
    gaz: 'Gaz',
    erp: 'État des risques (ERP)',
    termites: 'Termites',
    carrez: 'Mesurage loi Carrez',
    boutin: 'Surface habitable (loi Boutin)',
    anc: 'Assainissement non collectif',
    audit_renov: 'Audit énergétique',
    amiante_travaux: 'Amiante avant travaux',
    plomb_travaux: 'Plomb avant travaux'
  };

  // Diagnostics dont l'agence peut indiquer la date, selon le projet
  var CODES_VALIDITE = {
    vente: ['dpe', 'audit', 'amiante', 'plomb', 'elec', 'gaz', 'erp', 'termites', 'carrez', 'anc'],
    location: ['dpe', 'plomb', 'elec', 'gaz', 'erp', 'amiante', 'boutin']
  };

  // Ce que l'agence peut ajouter à la main dans sa demande
  var CATALOGUE = {
    vente: ['dpe', 'audit', 'amiante', 'plomb', 'elec', 'gaz', 'erp', 'carrez'],
    location: ['dpe', 'plomb', 'elec', 'gaz', 'erp', 'amiante', 'boutin'],
    renovation: ['audit_renov', 'dpe', 'amiante_travaux', 'plomb_travaux']
  };

  var NOTE_AMIANTE =
    "Le rapport reste valable et la vente reste possible : l'acquéreur en est informé. " +
    "Les suites dépendent des matériaux. Liste A (flocages, calorifugeages, faux plafonds) placée en surveillance : " +
    "nouvelle évaluation de l'état dans les 3 ans au plus. Liste B (plaques et ardoises en fibres-ciment, dalles de sol, conduits...) : " +
    "la réglementation ne fixe pas de périodicité ; le rapport recommande une évaluation périodique (EP) selon l'état du matériau, " +
    "ou des travaux (AC1, AC2). Envoyez-nous le rapport : on vous dit quoi faire.";

  var NOTE_DPE_ELEC =
    "Logement chauffé à l'électricité : l'étiquette peut souvent être améliorée gratuitement, sans nouvelle visite, " +
    "sur l'Observatoire DPE-Audit de l'ADEME (calcul modifié le 1er janvier 2026, puis le 1er janvier 2027). " +
    "Le DPE reste valable dans tous les cas.";

  /* ---------- dates ---------- */
  function D(iso) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function parseDate(s) {
    if (!s || typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return null;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (isNaN(d.getTime()) || d.getUTCDate() !== +m[3]) return null;
    return d;
  }
  function aujourdhui() {
    var n = new Date();
    return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
  }
  function isoAujourdhui() {
    var d = aujourdhui();
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmt(d) { return d ? pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear() : ''; }
  function fmtIso(s) { var d = parseDate(s); return d ? fmt(d) : ''; }
  // Dernier jour de validité : date du rapport + durée, moins un jour
  function finApres(d, duree) {
    var r = new Date(d.getTime());
    var jour = r.getUTCDate();
    if (duree.ans) r.setUTCFullYear(r.getUTCFullYear() + duree.ans);
    if (duree.mois) {
      r.setUTCDate(1);
      r.setUTCMonth(r.getUTCMonth() + duree.mois);
      var dernier = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
      r.setUTCDate(Math.min(jour, dernier));
    }
    return new Date(r.getTime() - JOUR);
  }

  function etatSelonFin(fin, ref, detail, note) {
    var jours = Math.round((fin.getTime() - ref.getTime()) / JOUR);
    var res = { fin: fin, detail: detail || '', note: note || '' };
    if (jours < 0) {
      res.etat = 'perime';
      res.texte = 'Fin de validité le ' + fmt(fin) + ' : à refaire.';
    } else if (jours <= 90) {
      res.etat = 'bientot';
      res.texte = 'Valable jusqu\'au ' + fmt(fin) + (jours === 0 ? ', dernier jour.' : ', encore ' + jours + (jours > 1 ? ' jours.' : ' jour.'));
    } else {
      res.etat = 'valable';
      res.texte = 'Valable jusqu\'au ' + fmt(fin) + '.';
    }
    return res;
  }

  function amiante(d, resultat) {
    if (d.getTime() < D('2013-04-01').getTime()) {
      return { etat: 'perime', texte: 'Fait avant le 1er avril 2013 : à refaire.',
        detail: 'Le repérage a été élargi depuis, notamment aux toitures, bardages et conduits extérieurs.' };
    }
    if (resultat === 'absence') {
      return { etat: 'illimite', texte: 'Valable sans limite de durée.',
        detail: 'Si des travaux ont été faits depuis, un nouveau repérage est conseillé.' };
    }
    if (resultat === 'presence') {
      return { etat: 'suivi', texte: 'Valable sans limite de durée, mais amiante repéré : suivez les recommandations du rapport.',
        detail: NOTE_AMIANTE };
    }
    return { etat: 'inconnu', texte: 'Indiquez si de l\'amiante a été repéré.' };
  }

  /* Validité d'un diagnostic existant.
   * code : dpe, audit, amiante, plomb, elec, gaz, erp, termites, carrez, boutin, anc
   * ctx : 'vente' ou 'location'
   * e : { date: 'AAAA-MM-JJ', resultat: 'absence' | 'presence' }
   * ref : date à laquelle il doit être valable (signature), aujourd'hui par défaut
   */
  function validite(code, ctx, e, ref) {
    e = e || {};
    var d = parseDate(e.date);
    if (!d) return { etat: 'vide', texte: '' };
    if (d.getTime() > aujourdhui().getTime()) return { etat: 'inconnu', texte: 'Cette date est dans le futur : vérifiez-la.' };
    ref = ref || aujourdhui();
    var location = ctx === 'location';
    var fin, detail = '', note = '';
    switch (code) {
      case 'dpe':
        if (d.getTime() < D('2013-01-01').getTime()) {
          fin = finApres(d, { ans: 10 });
        } else if (d.getTime() <= D('2017-12-31').getTime()) {
          fin = D('2022-12-31');
          detail = 'Les DPE faits entre 2013 et 2017 ne sont plus valables depuis le 31/12/2022.';
        } else if (d.getTime() <= D('2021-06-30').getTime()) {
          fin = D('2024-12-31');
          detail = 'Les DPE faits entre le 01/01/2018 et le 30/06/2021 ne sont plus valables depuis le 31/12/2024.';
        } else {
          fin = finApres(d, { ans: 10 });
          if (d.getTime() < D('2027-01-01').getTime()) note = NOTE_DPE_ELEC;
        }
        break;
      case 'audit':
        fin = finApres(d, { ans: 5 });
        break;
      case 'amiante':
        return amiante(d, e.resultat);
      case 'plomb':
        if (e.resultat === 'absence') return { etat: 'illimite', texte: 'Valable sans limite de durée (pas de plomb au-dessus du seuil).' };
        if (e.resultat !== 'presence') return { etat: 'inconnu', texte: 'Indiquez si du plomb a été trouvé au-dessus du seuil.' };
        fin = finApres(d, location ? { ans: 6 } : { ans: 1 });
        detail = location ? 'Plomb au-dessus du seuil : constat valable 6 ans pour une location.'
                          : 'Plomb au-dessus du seuil : constat valable 1 an pour une vente.';
        break;
      case 'elec':
      case 'gaz':
        fin = finApres(d, location ? { ans: 6 } : { ans: 3 });
        break;
      case 'erp':
        fin = finApres(d, { mois: 6 });
        detail = 'L\'état des risques doit dater de moins de 6 mois le jour de la signature.';
        break;
      case 'termites':
        fin = finApres(d, { mois: 6 });
        break;
      case 'anc':
        fin = finApres(d, { ans: 3 });
        detail = 'Contrôle fait par le SPANC (mairie ou communauté de communes).';
        break;
      case 'carrez':
      case 'boutin':
        return { etat: 'illimite', texte: 'Valable sans limite de durée, sauf travaux qui changent la surface.' };
      default:
        return { etat: 'vide', texte: '' };
    }
    return etatSelonFin(fin, ref, detail, note);
  }

  /* Diagnostics à prévoir selon les réponses.
   * r : { projet, type, copro, construction, elec, gaz, egout }
   * statut : oblig (coché), confirm (coché, à confirmer), cond (selon le cas, pas coché)
   */
  function aPrevoir(r) {
    var liste = [], infos = [];
    var hab = ['maison', 'appartement', 'immeuble', 'autre'].indexOf(r.type) !== -1 || !r.type;
    var avant1949 = r.construction === 'avant1949';
    var avant1997 = avant1949 || r.construction === '1949_1997';
    var nspConstruction = !r.construction || r.construction === 'nsp';
    function ajoute(code, statut, raison) { liste.push({ code: code, nom: nom(code, r.projet, r.copro), statut: statut, raison: raison }); }

    if (r.projet === 'vente') {
      ajoute('dpe', 'oblig', r.type === 'maison' ? 'Obligatoire (sauf maison de moins de 50 m²)' : 'Toujours obligatoire');
      // Audit énergétique : maison seulement, en option à cocher (on ne demande pas la classe du DPE :
      // la personne coche si elle pense que la maison sera classée E, F ou G)
      if (r.type === 'maison' && r.copro !== 'oui') ajoute('audit', 'cond', 'Obligatoire en plus du DPE si la maison est classée E, F ou G');
      if (avant1997) ajoute('amiante', 'oblig', 'Permis de construire avant le 1er juillet 1997');
      else if (nspConstruction) ajoute('amiante', 'confirm', 'Si le permis de construire date d\'avant le 1er juillet 1997');
      if (hab) {
        if (avant1949) ajoute('plomb', 'oblig', 'Construit avant 1949');
        else if (nspConstruction) ajoute('plomb', 'cond', 'Si le bien a été construit avant 1949');
        ajouteInstallations(r, ajoute);
      }
      ajoute('erp', 'oblig', 'À moins de 6 mois de la signature');
      if (r.copro === 'oui') ajoute('carrez', 'oblig', 'Lot de copropriété');
      infos.push('Termites, mérule et bruit des aérodromes dépendent de la commune : nous vérifions pour vous.');
      if (r.egout === 'non') infos.push('Assainissement individuel : contrôle à demander au SPANC (mairie ou communauté de communes), valable 3 ans.');
      else if (!r.egout || r.egout === 'nsp') infos.push('Si le bien n\'est pas raccordé au tout-à-l\'égout : contrôle de l\'assainissement par le SPANC.');
    } else if (r.projet === 'location') {
      ajoute('dpe', 'oblig', 'Toujours obligatoire');
      if (hab) {
        if (avant1949) ajoute('plomb', 'oblig', 'Construit avant 1949');
        else if (nspConstruction) ajoute('plomb', 'cond', 'Si le bien a été construit avant 1949');
        ajouteInstallations(r, ajoute);
        ajoute('boutin', 'confirm', 'Surface habitable à indiquer dans le bail');
      }
      ajoute('erp', 'oblig', 'À moins de 6 mois de la signature du bail');
      if (avant1997 || nspConstruction) ajoute('amiante', 'cond', 'À tenir à disposition du locataire s\'il le demande (permis avant juillet 1997)');
      infos.push('Bruit des aérodromes : selon la commune, nous vérifions pour vous.');
    } else if (r.projet === 'renovation') {
      if (r.type === 'maison') ajoute('audit_renov', 'cond', 'Pour préparer les travaux et les aides');
      ajoute('dpe', 'cond', 'État actuel du logement');
      if (avant1997 || nspConstruction) ajoute('amiante_travaux', 'cond', 'Avant travaux, si permis de construire avant juillet 1997');
      if (hab && (avant1949 || nspConstruction)) ajoute('plomb_travaux', 'cond', 'Avant travaux, si construit avant 1949');
      infos.push('Décrivez vos travaux dans le message : nous adaptons la mission.');
    }
    return { liste: liste, infos: infos };
  }

  function ajouteInstallations(r, ajoute) {
    if (r.elec === 'plus15') ajoute('elec', 'oblig', 'Installation de plus de 15 ans');
    else if (!r.elec || r.elec === 'nsp') ajoute('elec', 'confirm', 'Si l\'installation a plus de 15 ans');
    if (r.gaz === 'plus15') ajoute('gaz', 'oblig', 'Installation de plus de 15 ans');
    else if (!r.gaz || r.gaz === 'nsp') ajoute('gaz', 'cond', 'S\'il y a une installation gaz de plus de 15 ans');
  }

  function nom(code, projet, copro) {
    if (code === 'amiante' && projet === 'location') return copro === 'oui' ? 'Amiante, parties privatives (DAPP)' : 'Amiante';
    return NOMS[code] || code;
  }

  /* Tient compte des diagnostics que l'agence a déjà :
   * encore valable -> statut 'valide' (décoché), périmé -> 'oblig' (coché, à refaire). */
  function fusion(liste, existants, ctx, ref) {
    existants = existants || {};
    return liste.map(function (it) {
      var copie = { code: it.code, nom: it.nom, statut: it.statut, raison: it.raison };
      var e = existants[it.code];
      if (!e || !e.on || !e.date || (ctx !== 'vente' && ctx !== 'location')) return copie;
      var v = validite(it.code, ctx, e, ref);
      copie.validite = v;
      if (['valable', 'bientot', 'illimite', 'suivi'].indexOf(v.etat) !== -1) copie.statut = 'valide';
      else if (v.etat === 'perime') { copie.statut = 'oblig'; copie.raison = 'Rapport existant plus valable : à refaire'; }
      return copie;
    });
  }

  var SOURCES = [
    { titre: 'Service-public : diagnostics à fournir pour une vente', url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F10798' },
    { titre: 'Service-public : diagnostics à fournir pour une location', url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F33463' },
    { titre: 'Service-public : état d\'amiante (vérifié le 16/10/2026)', url: 'https://www.service-public.gouv.fr/particuliers/vosdroits/F742' },
    { titre: 'Ministère de la Transition écologique : DPE et durées de validité', url: 'https://www.ecologie.gouv.fr/politiques-publiques/diagnostic-performance-energetique-dpe' },
    { titre: 'Ministère : nouveau calcul du DPE au 1er janvier 2027', url: 'https://www.ecologie.gouv.fr/presse/dpe-audits-energetiques-publication-larrete-abaissant-facteur-conversion-lelectricite-17-1er' },
    { titre: 'Ministère de l\'Économie : audit énergétique (valable 5 ans)', url: 'https://www.economie.gouv.fr/particuliers/audit-energetique-obligation-proprietaires-vente-logements-energivores' },
    { titre: 'Ministère : termites (état valable 6 mois)', url: 'https://www.ecologie.gouv.fr/politiques-publiques/termites-insectes-xylophages-champignons-lignivores' },
    { titre: 'Légifrance : article L271-5 du code de la construction', url: 'https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000043978261' },
    { titre: 'INC : durées de validité en vente', url: 'https://inc-conso.fr/content/logement/vente-immobiliere-les-diagnostics-obligatoires-pour-les-logements-usage-dhabitation' },
    { titre: 'Notaires de France : durées de validité en location', url: 'https://www.notaires.fr/fr/immobilier-fiscalit%C3%A9/diagnostics-environnement/diagnostics-immobiliers-obligatoires-pour-la-location' }
  ];

  var api = {
    NOMS: NOMS, CODES_VALIDITE: CODES_VALIDITE, CATALOGUE: CATALOGUE, SOURCES: SOURCES, VERIFIE_LE: VERIFIE_LE,
    validite: validite, aPrevoir: aPrevoir, fusion: fusion, nom: nom,
    parseDate: parseDate, fmt: fmt, fmtIso: fmtIso, aujourdhui: aujourdhui, isoAujourdhui: isoAujourdhui, finApres: finApres
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.Regles = api;
})(typeof window !== 'undefined' ? window : this);
