// Contenu du manuel (affiché dans « Aide & manuel » et imprimé en PDF).
// Chaque capture est produite par scripts/capture.js : « setup » prépare l'écran réel, « marks » place les repères numérotés.
window.MANUAL = {
  version: '2.0.0',
  intro: 'Mode opératoire de Compta Elina 2.0, illustré par des captures réelles de la version Windows réalisées sur la boutique de démonstration fictive « Elina Studio ». Les chiffres entourés sur les captures renvoient aux étapes numérotées.',
  sections: [
    {
      title: 'Installation et premier lancement',
      goal: 'Installer Compta Elina sur un poste Windows et l\'ouvrir pour la première fois.',
      prereq: 'Windows 10 ou 11 en 64 bits, droits d\'installation pour votre compte, le fichier Compta-Elina-Setup-2.0.0.exe.',
      steps: [
        'Double-cliquez sur Compta-Elina-Setup-2.0.0.exe.',
        'Si Windows SmartScreen affiche « Windows a protégé votre ordinateur », cliquez sur « Informations complémentaires » puis « Exécuter quand même » : l\'installeur n\'est pas signé numériquement.',
        'Choisissez le dossier d\'installation (ou gardez celui proposé), puis cliquez sur « Installer » et « Fermer ».',
        'Lancez Compta Elina depuis le raccourci du bureau ou le menu Démarrer.',
        'Au premier lancement, le dossier est vide : cliquez sur « Explorer la démo » (repère 1) pour découvrir le logiciel avec des données fictives, ou sur « Configurer ma société » (repère 2) pour commencer votre propre dossier.'
      ],
      shots: [{ file: '01-premier-lancement.jpg', caption: 'Premier lancement de la version Windows (l\'assistant d\'installation Windows lui-même n\'est pas reproduit).', setup: 'window.__db = db; db = Ledger.empty(); go("dashboard");', after: 'db = window.__db; go("dashboard");', marks: [['[data-act="demo"]', 1], ['.hero-empty [data-v="settings"]', 2]] }],
      result: 'Compta Elina s\'ouvre sur l\'écran d\'accueil. Vos données seront enregistrées dans %APPDATA%\\compta-elina.',
      avoid: 'N\'installez pas le logiciel dans un dossier synchronisé (OneDrive, Dropbox) et ne l\'ouvrez pas deux fois en même temps : deux fenêtres écriraient dans le même fichier.',
      recover: 'Si l\'installation est bloquée, faites un clic droit sur le fichier, « Propriétés », cochez « Débloquer », puis relancez. Pour désinstaller : Paramètres Windows, Applications, Compta Elina. Vos données et sauvegardes restent dans %APPDATA%\\compta-elina.'
    },
    {
      title: 'Création et paramétrage du dossier',
      goal: 'Renseigner l\'identité de l\'entreprise, imprimée sur les factures et reprise dans le FEC, et adapter le plan comptable.',
      prereq: 'Le logiciel est installé. Ayez sous la main le SIREN, le numéro de TVA intracommunautaire, l\'adresse et l\'IBAN de l\'entreprise.',
      steps: [
        'Ouvrez « Paramètres & exports » dans le menu (repère 1).',
        'Remplissez la fiche société : raison sociale, SIREN à 9 chiffres, TVA intracommunautaire, adresse, email et IBAN (repère 2).',
        'Cliquez sur « Enregistrer » (repère 3).',
        'Si un compte manque dans le plan comptable, cliquez sur « Ajouter un compte » (repère 4) : numéro de 6 à 10 chiffres et libellé.',
        'Après une clôture, indiquez la date dans « Période clôturée jusqu\'au » : plus aucune écriture ne pourra être passée avant cette date.'
      ],
      shots: [{ file: '02-parametres.jpg', caption: 'Paramètres du dossier.', setup: 'go("settings");', marks: [['nav a[data-view="settings"]', 1], ['#companyForm', 2], ['#companyForm button.primary', 3], ['[data-act="accountForm"]', 4]] }],
      result: 'Les informations apparaissent sur les factures PDF et le SIREN permet l\'export du FEC.',
      avoid: 'Ne modifiez pas le libellé d\'un compte déjà utilisé pour changer sa nature : créez plutôt un nouveau compte.',
      recover: 'Une erreur de saisie dans la fiche société se corrige à tout moment : la fiche n\'est pas une écriture comptable.'
    },
    {
      title: 'Navigation générale',
      goal: 'Se repérer dans les menus, retrouver rapidement un document et comprendre d\'où viennent les chiffres.',
      prereq: 'Un dossier ouvert (la démo convient).',
      steps: [
        'Le menu de gauche regroupe les pages par thème : Commercial, Comptabilité, Outils et Dossier (repère 1).',
        'Le champ « Rechercher » ou le raccourci Ctrl + K (repère 2) retrouve une facture, un client, un article, un outil ou une action ; naviguez avec les flèches et validez avec Entrée.',
        'Le bouton « Alertes » (repère 3) indique le nombre d\'alertes et d\'actions qui attendent votre validation.',
        'Le bouton « Personnaliser » (repère 4), toujours visible, ouvre le centre de personnalisation.',
        'Sur le tableau de bord, survolez un indicateur et cliquez sur la flèche ↗ (repère 5) pour voir les données qui le composent : grand livre, factures, balance âgée…'
      ],
      shots: [
        { file: '03-navigation.jpg', caption: 'Tableau de bord et menu principal.', setup: 'go("dashboard"); document.querySelectorAll(".w .trace").forEach(b => b.style.opacity = 1);', marks: [['nav', 1], ['.search', 2], ['#bell', 3], ['.customize-btn', 4], ['.w .trace', 5]] },
        { file: '03-recherche.jpg', caption: 'Recherche rapide (Ctrl + K).', setup: 'go("dashboard"); openPalette(); const i = document.querySelector("#palette input"); i.value = "lampe"; i.dispatchEvent(new Event("input"));', after: 'document.getElementById("palette").classList.remove("show");', marks: [['#palette .pal', 2]] }
      ],
      result: 'Vous accédez à chaque page en un clic et retrouvez n\'importe quel document par son numéro, son client ou son montant.',
      avoid: 'Les raccourcis Alt + 1 à 9 ouvrent vos favoris : ne les confondez pas avec ceux d\'un autre logiciel ouvert en même temps.',
      recover: 'Si une page semble vide après une mise à jour du site, rechargez avec Ctrl + F5.'
    },
    {
      title: 'Personnalisation des couleurs et des thèmes',
      goal: 'Adapter l\'apparence : mode clair ou sombre, couleurs, taille du texte, effets et animations.',
      prereq: 'Aucun. Les préférences sont propres à chaque poste (ou navigateur) et séparées des données comptables.',
      steps: [
        'Cliquez sur « Personnaliser » (repère 1).',
        'Dans l\'onglet « Thème » (repère 2), choisissez l\'affichage : automatique, clair ou sombre (repère 3).',
        'Choisissez un thème prédéfini (Indigo, Océan, Émeraude, Graphite, Framboise, Ambre) ou « Personnalisé » (repère 4), puis ajustez les couleurs principale et secondaire, les couleurs d\'état, les surfaces et les graphiques.',
        'Chaque modification s\'applique immédiatement en aperçu. Cliquez sur « Enregistrer » (repère 5) pour la garder, ou « Annuler » pour revenir à l\'état précédent.',
        'L\'onglet « Texte & confort » règle la taille générale, la police, la hauteur de ligne, la densité, les arrondis, le contraste renforcé et les animations (repère 6).',
        'L\'onglet « Sauvegarde » exporte ou importe vos préférences en fichier JSON et propose le retour aux réglages d\'origine.'
      ],
      shots: [
        { file: '04-theme.jpg', caption: 'Centre de personnalisation, onglet Thème (mode clair).', setup: 'go("dashboard"); actions.customize();', after: 'actions.cCancel();', marks: [['.customize-btn', 1], ['#custom .ctabs button.on', 2], ['#custom fieldset .opts', 3], ['#custom .swatches', 4], ['#custom [data-act="cSave"]', 5]] },
        { file: '04-texte-sombre.jpg', caption: 'Onglet Texte & confort, aperçu en mode sombre avec le thème Océan.', setup: 'go("dashboard"); actions.customize(); window.previewPrefs.mode = "dark"; window.previewPrefs.preset = "ocean"; applyPrefs(); renderNav(); actions.cTab({ t: "text" });', after: 'actions.cCancel();', marks: [['#custom .cbody', 6]] }
      ],
      result: 'L\'interface garde vos réglages d\'une session à l\'autre, sur ce poste.',
      avoid: 'Avec des couleurs de surface personnalisées, vérifiez que le texte reste lisible : le contraste n\'est pas recalculé automatiquement.',
      recover: 'Personnaliser, onglet « Sauvegarde », « Apparence d\'origine » puis « Enregistrer » remet l\'apparence par défaut.'
    },
    {
      title: 'Déplacement et organisation des widgets',
      goal: 'Composer un ou plusieurs tableaux de bord avec les indicateurs utiles.',
      prereq: 'Un dossier contenant des données.',
      steps: [
        'Sur le tableau de bord, cliquez sur « Modifier la disposition » (repère 1).',
        'Le bandeau « Ajouter un bloc » (repère 2) liste les blocs masqués : cliquez sur un bloc pour l\'ajouter.',
        'Chaque bloc a sa barre d\'outils (repère 3) : ← et → pour le déplacer, « x/12 » pour sa largeur, ↕ pour sa hauteur, ✕ pour le masquer. À la souris, vous pouvez aussi le glisser-déposer.',
        '« Annuler » (ou Ctrl + Z) revient en arrière ; « Réinitialiser » rétablit la disposition du profil (repère 4).',
        'Les onglets au-dessus des blocs (repère 5) passent d\'un tableau de bord à l\'autre ; « + Nouveau » en crée un à partir d\'un profil : Bureau, Comptabilité, Direction ou Personnalisé.',
        'Cliquez sur « Terminé » : la disposition est enregistrée automatiquement.'
      ],
      shots: [{ file: '05-disposition.jpg', caption: 'Mode « Modifier la disposition ».', setup: 'go("dashboard"); actions.dashEdit();', after: 'actions.dashEdit();', marks: [['[data-act="dashEdit"]', 1], ['.dash-add', 2], ['.w-tools', 3], ['[data-act="dashReset"]', 4], ['.dash-tabs', 5]] }],
      result: 'Le tableau de bord affiche les blocs choisis, dans l\'ordre et à la taille voulus, après chaque redémarrage.',
      avoid: 'Le glisser-déposer ne fonctionne qu\'en mode « Modifier la disposition » : les lignes de tableaux et les formulaires ne sont jamais déplaçables.',
      recover: 'Un bloc masqué par erreur se rajoute depuis le bandeau « Ajouter un bloc ». Un tableau supprimé se récupère avec « Annuler » tant que vous n\'avez pas quitté la page.'
    },
    {
      title: 'Gestion des clients et fournisseurs',
      goal: 'Créer les tiers et consulter, pour chacun, coordonnées, solde, échéances et historique.',
      prereq: 'Le dossier est paramétré.',
      steps: [
        'Ouvrez « Clients & fournisseurs » (repère 1).',
        'Cliquez sur « Nouveau client » ou « Nouveau fournisseur » (repère 2) ; renseignez le nom, le SIREN, l\'email, l\'adresse et le délai de paiement (60 jours au plus).',
        'Cliquez sur une ligne (repère 3) pour ouvrir la fiche du tiers.',
        'La fiche réunit le solde comptable, les factures à régler, les documents, les règlements et l\'historique comptable (repère 4) ; « Modifier les coordonnées » ouvre le formulaire.'
      ],
      shots: [
        { file: '06-tiers.jpg', caption: 'Liste des clients et fournisseurs.', setup: 'go("tiers");', marks: [['nav a[data-view="tiers"]', 1], ['[data-act="tierForm"][data-type="C"]', 2], ['#main tr.click', 3]] },
        { file: '06-fiche-tiers.jpg', caption: 'Fiche d\'un client.', setup: 'go("tier", { id: db.tiers.find(t => t.type === "C").id });', marks: [['#main .cards', 4]] }
      ],
      result: 'Chaque tiers reçoit un code (C0001, F0001) et son solde se met à jour à chaque facture et règlement.',
      avoid: 'Ne créez pas deux fois le même client : cherchez-le d\'abord avec le champ de recherche.',
      recover: 'Un tiers en double ne peut pas être supprimé s\'il a des documents : rattachez les nouveaux documents au bon tiers et arrêtez d\'utiliser le doublon.'
    },
    {
      title: 'Création d\'un devis et transformation en facture',
      goal: 'Établir un devis, le transformer en bon de commande puis en facture, sans ressaisie.',
      prereq: 'Au moins un client et un article.',
      steps: [
        'Dans « Ventes », cliquez sur « Nouveau devis ».',
        'Choisissez le client (repère 1) et ajoutez les lignes : article, quantité, prix, remise et TVA (repère 2) ; le compte de produit est déterminé automatiquement.',
        'Cliquez sur « Enregistrer » : le devis reçoit un numéro DE-AAAA-NNNNN.',
        'Quand le client accepte, ouvrez le devis et cliquez sur « Transformer en commande » ou directement « Transformer en facture » (repère 3).',
        'Dans la facture, le bandeau « Documents liés » (repère 4) montre la chaîne devis → commande → facture ; chaque document est cliquable.',
        'Vérifiez la facture, puis cliquez sur « Valider et émettre » (repère 5) : elle reçoit son numéro définitif, l\'écriture de vente est passée et le stock est mis à jour.'
      ],
      shots: [
        { file: '07-devis.jpg', caption: 'Devis enregistré, prêt à être transformé.', setup: 'go("sales"); const p = db.products.find(x => x.type === "GOODS"); const d = { id: L.uid(), kind: "SALE", type: "QUOTE", status: "DRAFT", date: today(), due: addDays(today(), 30), tierId: db.tiers.find(t => t.type === "C").id, lines: [{ productId: p.id, label: p.label, qty: 2, price: p.price, disc: 0, vat: 20 }], globalDisc: 0, ref: "", notes: "" }; d.number = L.draftNumber(db, d); db.docs.push(d); window.__quote = d.id; docForm({ id: d.id });', after: 'closeModal();', marks: [['#modalForm [name="tierId"]', 1], ['#lines tr', 2], ['[data-act="convert"][data-to="ORDER"]', 3]] },
        { file: '07-facture-liee.jpg', caption: 'Facture issue du devis, avec ses documents liés.', setup: 'go("sales"); const o = L.convert(db, window.__quote, "ORDER", today()); const f = L.convert(db, o.id, "INVOICE", today()); docForm({ id: f.id });', after: 'closeModal();', marks: [['.doc-links', 4], ['[data-act="issueDoc"]', 5]] }
      ],
      result: 'La facture émise apparaît dans « Ventes » avec le statut « À régler » ; le devis et la commande passent au statut « Transformé ».',
      avoid: 'Une facture émise ne se modifie plus et ne se supprime pas : c\'est une obligation légale. Relisez-la avant de cliquer sur « Valider et émettre ».',
      recover: 'Pour corriger une facture émise, ouvrez-la et cliquez sur « Créer un avoir », puis émettez une nouvelle facture correcte.'
    },
    {
      title: 'Enregistrement d\'un achat et d\'un règlement',
      goal: 'Saisir une facture fournisseur et enregistrer son paiement, puis encaisser une facture client.',
      prereq: 'Un fournisseur existe ; vous avez la facture du fournisseur.',
      steps: [
        'Dans « Achats », cliquez sur « Nouvelle facture ».',
        'Choisissez le fournisseur et saisissez son numéro de facture (repère 1).',
        'Ajoutez les lignes ; pour une dépense sans article (loyer, abonnement…), laissez le compte sur « Automatique » : une règle d\'affectation le choisit d\'après le libellé, ou choisissez-le vous-même (repère 2).',
        'Cliquez sur « Valider et émettre » : l\'écriture d\'achat est passée et le stock augmente pour les marchandises.',
        'Pour payer, ouvrez la facture et cliquez sur « Enregistrer un règlement » (repère 3).',
        'Indiquez la date, le montant (paiement partiel possible) et le mode (repère 4), puis « Enregistrer ». Un règlement identique déjà saisi déclenche une demande de confirmation.'
      ],
      shots: [
        { file: '08-achat.jpg', caption: 'Facture fournisseur émise.', setup: 'go("purchases"); const d = db.docs.find(x => x.kind === "PURCHASE" && x.status === "ISSUED" && x.lines.some(l => l.acc)) || db.docs.find(x => x.kind === "PURCHASE" && x.status === "ISSUED"); docForm({ id: d.id });', after: 'closeModal();', marks: [['#modalForm [name="ref"]', 1], ['#lines [name="acc"]', 2], ['[data-act="payForm"]', 3]] },
        { file: '08-reglement.jpg', caption: 'Saisie d\'un règlement.', setup: 'go("purchases"); const d = db.docs.find(x => x.kind === "PURCHASE" && x.status === "ISSUED"); docForm({ id: d.id }); actions.payForm();', after: 'closeModal();', marks: [['#modalForm .grid', 4]] }
      ],
      result: 'La facture passe à « Réglée » quand le total est payé ; la trésorerie et le solde du tiers sont mis à jour.',
      avoid: 'N\'enregistrez pas un paiement en double : si le message « Un règlement identique existe déjà » apparaît, vérifiez votre relevé bancaire avant de confirmer.',
      recover: 'Un règlement saisi par erreur se corrige par une écriture inverse dans « Écritures » (saisie manuelle), à faire valider par votre expert-comptable.'
    },
    {
      title: 'Gestion du stock',
      goal: 'Suivre les quantités, la valeur du stock et les mouvements.',
      prereq: 'Des articles de type « Marchandise ».',
      steps: [
        'Ouvrez « Articles & stock » (repère 1) : quantité, coût moyen pondéré (CMUP), taux de marque et alerte de stock bas (en rouge).',
        'Le seuil d\'alerte se règle dans la fiche de l\'article ; les alertes apparaissent aussi dans « Alertes ».',
        'Après un comptage, cliquez sur « Ajuster un stock » (repère 2), indiquez la quantité réelle et le motif : l\'écart est enregistré comme mouvement.',
        'Cliquez sur « Mouvements de stock » (repère 3) pour voir chaque entrée et sortie, reliée à sa facture.',
        'À la clôture, la « Boîte à outils », outil « Rotation & inventaire », passe l\'écriture d\'inventaire (comptes 37 et 6037).'
      ],
      shots: [
        { file: '09-stock.jpg', caption: 'Articles et stock.', setup: 'go("products");', marks: [['nav a[data-view="products"]', 1], ['[data-act="stockAdjust"]', 2], ['#main [data-v="movements"]', 3]] },
        { file: '09-mouvements.jpg', caption: 'Mouvements de stock reliés aux factures.', setup: 'go("movements");', marks: [['#main table', 3]] }
      ],
      result: 'Le stock suit chaque vente, achat, avoir et inventaire ; aucune ligne de facture ne produit deux mouvements.',
      avoid: 'Ne corrigez pas un stock en modifiant les quantités d\'une facture déjà émise : utilisez « Ajuster un stock » ou un avoir.',
      recover: 'Un stock négatif signale un achat non saisi : saisissez la facture fournisseur manquante, ou ajustez après comptage.'
    },
    {
      title: 'Saisie et vérification des écritures',
      goal: 'Consulter les écritures générées et saisir les opérations diverses (salaires, apports, amortissements…).',
      prereq: 'Notions de débit et de crédit ; en cas de doute, demandez à votre expert-comptable.',
      steps: [
        'Ouvrez « Écritures » (repère 1).',
        'Filtrez par journal (repère 2) ou cherchez une pièce, un libellé ou un compte (repère 3).',
        'Cliquez sur le numéro de pièce (repère 4) pour ouvrir le document d\'origine, ou sur un compte pour son grand livre.',
        'Pour une opération sans facture, cliquez sur « Saisie manuelle (OD) » (repère 5).',
        'Saisissez la date, la pièce, les comptes et les montants : le total des débits doit égaler celui des crédits, sinon l\'écriture est refusée (repère 6).',
        'Lancez régulièrement « Boîte à outils », « Contrôles comptables » : dix vérifications avec un score (repère 7).'
      ],
      shots: [
        { file: '10-ecritures.jpg', caption: 'Journal des écritures.', setup: 'go("journal");', marks: [['nav a[data-view="journal"]', 1], ['#jf', 2], ['#jq', 3], ['#main td button.link', 4], ['[data-act="odForm"]', 5]] },
        { file: '10-saisie-od.jpg', caption: 'Saisie manuelle d\'une écriture.', setup: 'go("journal"); actions.odForm();', after: 'closeModal();', marks: [['#odl', 6]] },
        { file: '10-controles.jpg', caption: 'Contrôles comptables automatiques.', setup: 'go("tools", { t: "checks" });', marks: [['.checks', 7]] }
      ],
      result: 'Chaque écriture validée est numérotée, équilibrée et reliée à sa pièce justificative.',
      avoid: 'Une écriture validée ne se modifie pas et ne se supprime pas. N\'utilisez pas le compte d\'attente 471 sans le solder ensuite.',
      recover: 'Pour corriger une écriture, passez l\'écriture inverse (mêmes comptes, débit et crédit échangés), puis la bonne écriture.'
    },
    {
      title: 'Consultation du grand livre et de la balance',
      goal: 'Vérifier les soldes des comptes et le détail de leurs mouvements.',
      prereq: 'Des écritures dans le dossier.',
      steps: [
        'Ouvrez « Balance & grand livre » (repère 1).',
        'Choisissez la période (repère 2) : la balance affiche débits, crédits et soldes de chaque compte, et vérifie l\'équilibre en bas de tableau.',
        'Cliquez sur un compte (repère 3) pour ouvrir son grand livre, avec le solde progressif.',
        '« Export CSV / Excel » (repère 4) enregistre la balance pour votre tableur ou votre expert-comptable.'
      ],
      shots: [
        { file: '11-balance.jpg', caption: 'Balance générale.', setup: 'go("balance");', marks: [['nav a[data-view="balance"]', 1], ['#pfrom', 2], ['#main tr.click', 3], ['[data-act="exportBalance"]', 4]] },
        { file: '11-grand-livre.jpg', caption: 'Grand livre du compte clients 411.', setup: 'go("ledger", { acc: "411000" });', marks: [] }
      ],
      result: 'La mention « Équilibrée ✓ » confirme que le total des débits égale le total des crédits.',
      avoid: 'Une balance déséquilibrée ne devrait jamais apparaître : si c\'est le cas, ne déclarez rien et lancez les contrôles comptables.',
      recover: 'Restaurez la dernière sauvegarde saine (procédure 15) si un fichier a été modifié en dehors du logiciel.'
    },
    {
      title: 'Gestion de la TVA',
      goal: 'Préparer la déclaration de TVA à partir des opérations validées, puis passer l\'écriture de liquidation.',
      prereq: 'Factures de la période émises ; régime de TVA sur les débits.',
      steps: [
        'Ouvrez « TVA » et choisissez la période déclarée (repère 1).',
        'Lisez l\'avertissement (repère 2) : ces montants aident à déclarer mais ne constituent pas une déclaration validée.',
        'Relevez la TVA collectée, la TVA déductible et le solde (repère 3), et la ventilation des ventes par taux.',
        'Traitez chaque point de la liste « Contrôles » (repère 4) : écart entre factures et comptabilité, taux à 0 %, factures d\'achat sans numéro, brouillons oubliés.',
        'Déclarez sur impots.gouv.fr. Une fois la déclaration déposée, cliquez sur « Passer l\'écriture de liquidation » (repère 5).'
      ],
      shots: [{ file: '12-tva.jpg', caption: 'Préparation de la TVA du mois.', setup: 'go("vat", { from: today().slice(0, 7) + "-01", to: today() });', marks: [['#pfrom', 1], ['.alert.info', 2], ['#main .cards', 3], ['.checks', 4], ['[data-act="settleVat"]', 5]] }],
      result: 'Après liquidation, les comptes de TVA collectée et déductible sont soldés vers « TVA à décaisser » (445510) ou « crédit de TVA » (445670).',
      avoid: 'Ne passez pas la liquidation avant d\'avoir vérifié la déclaration : c\'est une écriture définitive.',
      recover: 'Une liquidation passée sur une mauvaise période se corrige par l\'écriture inverse, saisie manuellement.'
    },
    {
      title: 'Consultation de la trésorerie',
      goal: 'Suivre la banque et la caisse, et rapprocher la comptabilité du relevé bancaire.',
      prereq: 'Des règlements enregistrés ; votre relevé bancaire.',
      steps: [
        'Ouvrez « Trésorerie » (repère 1) : soldes banque, caisse, clients et fournisseurs, puis la liste des règlements cliquables.',
        'Cliquez sur « Rapprochement bancaire » (repère 2).',
        'Saisissez la date et le solde du relevé, puis « Mettre à jour » (repère 3).',
        'Cochez chaque opération présente sur le relevé (repère 4) : l\'écart doit tomber à zéro.',
        'Une alerte signale les opérations en double possible (même date, même montant, même libellé).'
      ],
      shots: [
        { file: '13-tresorerie.jpg', caption: 'Trésorerie.', setup: 'go("treasury");', marks: [['nav a[data-view="treasury"]', 1], ['#main [data-v="reconcile"]', 2]] },
        { file: '13-rapprochement.jpg', caption: 'Rapprochement bancaire.', setup: 'go("reconcile");', marks: [['#stmtForm', 3], ['#main table', 4]] }
      ],
      result: 'Un écart nul confirme que la comptabilité et la banque concordent.',
      avoid: 'Ne pointez pas une opération qui ne figure pas sur le relevé pour « faire tomber » l\'écart.',
      recover: 'Un écart persistant indique un règlement non saisi ou saisi deux fois : comparez ligne à ligne et corrigez par un règlement ou une écriture inverse.'
    },
    {
      title: 'Exports, PDF et sauvegardes',
      goal: 'Produire les fichiers à transmettre (FEC, CSV, PDF) et protéger le dossier.',
      prereq: 'SIREN renseigné pour le FEC.',
      steps: [
        'Dans « Paramètres & exports », cliquez sur « Exporter le FEC » (repère 1) et indiquez l\'année : le fichier est nommé SIRENFECAAAAMMJJ.txt.',
        '« Sauvegarder le dossier (.json) » (repère 2) crée un fichier de sauvegarde avec une empreinte de contrôle.',
        'Pour une facture, ouvrez-la et cliquez sur « PDF » (repère 3) ; sur le site, choisissez « Enregistrer au format PDF » dans la fenêtre d\'impression.',
        'Les balances et comptes de résultat s\'exportent en CSV depuis leur page.',
        'Dans « Automatisations » (repère 4), la sauvegarde planifiée et l\'export récurrent se règlent dans « Règles ».'
      ],
      shots: [
        { file: '14-exports.jpg', caption: 'Exports et sauvegarde.', setup: 'go("settings");', marks: [['[data-act="exportFec"]', 1], ['#main [data-act="backup"]', 2]] },
        { file: '14-pdf.jpg', caption: 'Bouton PDF d\'une facture.', setup: 'go("sales"); const d = db.docs.find(x => x.kind === "SALE" && x.type === "INVOICE" && x.status === "PAID"); docForm({ id: d.id });', after: 'closeModal();', marks: [['[data-act="printDoc"]', 3]] },
        { file: '14-automatisations.jpg', caption: 'Règles des automatisations.', setup: 'go("automation"); document.getElementById("rulesForm").scrollIntoView();', marks: [['#rulesForm', 4]] }
      ],
      result: 'Les fichiers sont enregistrés à l\'endroit choisi ; la sauvegarde planifiée ajoute une copie à l\'historique.',
      avoid: 'Ne transmettez pas le FEC d\'un dossier de démonstration : le logiciel vous le signale.',
      recover: 'Si un export échoue, vérifiez le SIREN et l\'espace disque, puis recommencez ; l\'historique des automatisations indique l\'erreur.'
    },
    {
      title: 'Restauration des données',
      goal: 'Revenir à une sauvegarde après une erreur ou sur un nouveau poste.',
      prereq: 'Un fichier de sauvegarde .json, ou une copie de l\'historique.',
      steps: [
        'Ouvrez « Sauvegardes » (repère 1) : l\'historique liste les copies automatiques, planifiées et de sécurité.',
        'Cliquez sur « Restaurer… » face à une copie (repère 2), ou sur « Restaurer depuis un fichier… » pour un fichier .json (repère 3).',
        'Le fichier est vérifié avant tout : structure, équilibre de chaque écriture et empreinte. Un fichier modifié ou incomplet est refusé et votre dossier n\'est pas touché.',
        'Lisez le récapitulatif (société, nombre de documents et d\'écritures, date, données de démonstration) et confirmez.',
        'Une copie de sécurité du dossier actuel est faite automatiquement avant le remplacement.'
      ],
      shots: [{ file: '15-sauvegardes.jpg', caption: 'Historique des sauvegardes.', setup: 'go("backups");', wait: 600, marks: [['nav a[data-view="backups"]', 1], ['#snaps [data-act="restoreSnapshot"]', 2], ['#main [data-act="restore"]', 3]] }],
      result: 'Le dossier restauré s\'affiche et la restauration est inscrite dans l\'historique des automatisations.',
      avoid: 'Ne restaurez pas une sauvegarde de démonstration sur votre dossier réel : le récapitulatif l\'indique en majuscules.',
      recover: 'Si la restauration ne convient pas, restaurez la copie « Avant restauration » créée juste avant.'
    },
    {
      title: 'Différences entre le site et Windows',
      goal: 'Choisir la bonne version et transférer ses données de l\'une à l\'autre.',
      prereq: 'Aucun.',
      steps: [
        'Les deux versions partagent le même code : mêmes écrans, mêmes calculs, mêmes règles.',
        'Les données ne sont pas partagées : le site enregistre dans le navigateur utilisé, Windows dans %APPDATA%\\compta-elina. Vider le navigateur efface les données du site.',
        'Pour passer de l\'un à l\'autre : « Sauvegarder le dossier (.json) » d\'un côté, « Restaurer une sauvegarde » de l\'autre. Faites de même pour les préférences (Personnaliser, onglet Sauvegarde).',
        'Sous Windows : sauvegardes automatiques sur disque avec rotation, exports récurrents écrits dans un dossier autorisé, PDF enregistrés directement.',
        'Sur le site : sauvegardes automatiques limitées à 8 copies dans le navigateur, exports à télécharger d\'un clic, PDF via la fenêtre d\'impression.',
        'Il n\'existe pas de synchronisation automatique : elle demanderait un serveur sécurisé avec comptes utilisateurs, qui n\'est pas fourni.'
      ],
      shots: [
        { file: '16-site-web.jpg', caption: 'Version site web (GitHub Pages), même écran.', web: true, marks: [] },
        { file: '16-windows.jpg', caption: 'Version Windows, même écran.', setup: 'go("backups");', wait: 600, marks: [] }
      ],
      result: 'Vous savez où sont vos données et comment les déplacer sans perte.',
      avoid: 'Ne saisissez pas en parallèle sur le site et sur Windows : il faudrait ensuite choisir quelle version garder, sans fusion possible.',
      recover: 'Si vous avez saisi des deux côtés, gardez la version la plus complète et ressaisissez les écarts.'
    },
    {
      title: 'Dépannage et erreurs courantes',
      goal: 'Résoudre seul les situations les plus fréquentes.',
      prereq: 'Aucun.',
      steps: [
        '« Écriture déséquilibrée » : le total des débits diffère de celui des crédits dans une saisie manuelle ; corrigez les montants.',
        '« Période clôturée » : la date est antérieure à la clôture indiquée dans les paramètres ; datez l\'opération après la clôture ou demandez à votre expert-comptable.',
        '« Stock insuffisant » : l\'émission vous demande de confirmer ; vérifiez qu\'aucun achat n\'est manquant.',
        '« Empreinte incorrecte » lors d\'une restauration : le fichier a été modifié ou tronqué ; utilisez une autre sauvegarde.',
        'Page vide ou ancienne version sur le site : rechargez avec Ctrl + F5.',
        '« Dossier illisible » au démarrage : le fichier n\'est pas modifié ; restaurez une sauvegarde depuis l\'écran proposé (une copie .bak de l\'avant-dernière version existe sous Windows).',
        'Consultez « Automatisations » (repère 1) : alertes, actions à valider et historique des erreurs.'
      ],
      shots: [{ file: '17-automatisations.jpg', caption: 'Alertes, actions à valider et historique.', setup: 'go("automation");', marks: [['#main .pending', 1]] }],
      result: 'La plupart des messages indiquent directement l\'action à mener.',
      avoid: 'Ne modifiez jamais le fichier compta.json à la main : l\'empreinte et les contrôles le refuseraient.',
      recover: 'En dernier recours, restaurez la dernière sauvegarde de l\'historique ; la copie de sécurité permet toujours de revenir en arrière.'
    }
  ]
};
