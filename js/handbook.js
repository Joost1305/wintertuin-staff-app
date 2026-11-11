// The handbook: how every part of the Team app and Wintertuin Finance works.
// KEEP THIS UP TO DATE: every change to a feature also changes the matching chapter here (and UPDATED).
// Format per section: [title, html]. Keep the language plain: what you see, what you tap, what happens.
export const UPDATED = '2026-11-11';

const ul = (...items) => `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>`;
const ol = (...items) => `<ol>${items.map((x) => `<li>${x}</li>`).join('')}</ol>`;
const p = (...xs) => xs.map((x) => `<p>${x}</p>`).join('');
const tip = (x) => `<p class="hb-tip">${x}</p>`;

// route: the page(s) of the app this chapter explains; the help icon opens that chapter
export const CHAPTERS = [
  // ---------------------------------------------------------------- Team app
  { id: 'start', app: 'team', title: 'Aan de slag', routes: [], sections: [
    ['Wat is de app', p('Twee apps met één login. De <strong>Team-app</strong> is voor het hele team: rooster, checklists, menu, events, HACCP. <strong>Wintertuin Finance</strong> is voor de cijfers: dagafsluiting, maand, dashboard. Met de knop linksboven (Finance of Team-app) wissel je van app.')],
    ['Inloggen', p('Log in met je e-mailadres en wachtwoord. Je krijgt je login van een manager. Wachtwoord vergeten: vraag een manager om een nieuw wachtwoord (Instellingen, Team en accounts, Nieuw wachtwoord).') + tip('Verander een wachtwoord dat je via WhatsApp kreeg na de eerste keer inloggen. Medewerkers: Meer, Wachtwoord. Managers: Instellingen, Wachtwoord en pincode.')],
    ['De app op je beginscherm', ol('Open de app in Safari (iPhone) of Chrome (Android).', 'iPhone: tik op het deel-icoon en kies <em>Zet op beginscherm</em>. Android: menu, <em>Toevoegen aan startscherm</em>.', 'Open de app voortaan via het icoon. Hij opent dan schermvullend.')],
    ['Pincode', p('Na een tijdje niets doen vraagt de app je pincode. Zo kan niemand anders verder op jouw telefoon. Je kiest je pincode op de pagina <strong>Inklokken</strong>. Dezelfde pincode gebruik je op de inkloktablet.')],
    ['Taal', p('Rechtsboven wissel je tussen NL en EN. Je keuze wordt onthouden. Deze handleiding is in het Nederlands.')],
    ['Navigeren', ul('Onderin staan de belangrijkste pagina\'s, onder <strong>Meer</strong> de rest.', 'De W linksboven brengt je altijd terug naar Vandaag.', 'Het <strong>?</strong>-icoontje rechtsboven opent deze handleiding bij de pagina waar je bent.')],
    ['Nieuwe versie', p('De app werkt zichzelf bij. Zie je een aanpassing nog niet, sluit de app dan één keer helemaal af en open hem opnieuw.')],
  ] },
  { id: 'today', app: 'team', title: 'Vandaag', routes: ['today'], sections: [
    ['Wat je ziet', ul('Je volgende dienst en wanneer je daarna weer werkt.', 'De knop <strong>Inklokken</strong> of <strong>Uitklokken</strong>.', 'Een smalle regel met het event van vandaag of het eerstvolgende event. Tik erop om het te openen.', 'Ruilverzoeken die op je wachten.', '<strong>Vandaag aan het werk</strong>: wie er vandaag staat, met foto.', '<strong>Checklists vandaag</strong>: hoe ver elke lijst is.', 'Snelkoppelingen naar Menu, HACCP, Events en Links.')],
    ['Inklokken', p('Tik bij het begin van je dienst op Inklokken en aan het einde op Uitklokken. De tijden komen in de urenregistratie en in Finance.')],
  ] },
  { id: 'roster', app: 'team', title: 'Rooster', routes: ['roster'], sections: [
    ['Dag, week en maand', p('Bovenaan kies je <strong>Dag</strong>, <strong>Week</strong> of <strong>Maand</strong>. De app onthoudt je keuze. Met de pijltjes ga je terug of vooruit, met Vandaag naar nu.')],
    ['Kleuren', p('De kleur laat de afdeling zien: keuken, bar, bakkerij, zaal. Je eigen diensten hebben een donkere rand. Een sterretje bij een dag betekent dat er een event is.')],
    ['Diensten plannen (managers)', ol('Tik op het <strong>+</strong> bij een naam en een dag.', 'Kies een vaste dienst of vul tijden en afdeling zelf in.', 'Sla op. Tik op een dienst om hem te wijzigen of te verwijderen.') + p('Vaste diensten (zoals Ochtend keuken) maak je onder Instellingen, Vaste diensten.')],
    ['Open of dicht', p('Onder een datum staat <strong>Open</strong> of <strong>Dicht</strong>. Managers zetten een dag met één tik om. Met het potlood zet je een notitie bij een dag, bijvoorbeeld "besloten feest". Grijze dagen zijn dicht.')],
    ['Volgorde van namen', p('In de weekweergave sleep je een naam aan het greepje (⠿) omhoog of omlaag.')],
    ['Uren', p('Onder het rooster staat <strong>Uren deze week</strong>: geplande en gewerkte uren per persoon.')],
    ['Printen en exporteren', ul('<strong>Print: wie werkt vandaag</strong> maakt een lijst voor aan de muur.', '<strong>Exporteren</strong>: je eigen diensten of het hele rooster naar je agenda (ics) of als spreadsheet (csv).')],
  ] },
  { id: 'swap', app: 'team', title: 'Diensten ruilen', routes: ['swap'], sections: [
    ['Een dienst aanbieden', ol('Ga naar Diensten ruilen.', 'Kies je dienst en bied hem aan, eventueel aan een collega.', 'Een collega neemt hem over. Daarna keurt een manager de ruil goed.')],
    ['Goedkeuren (managers)', p('Wachtende ruilverzoeken staan bovenaan Vandaag. Tik erop, controleer en keur goed of af. Het rooster past zich vanzelf aan.')],
  ] },
  { id: 'checkin', app: 'team', title: 'Inklokken en inkloktablet', routes: ['checkin', 'kiosk'], sections: [
    ['Inklokken', p('Klok in bij het begin van je dienst en uit bij het einde, op Vandaag of op de pagina Inklokken. Je ziet daar ook je eigen geklokte tijden.')],
    ['Inkloktablet (managers)', p('Een tablet bij de ingang kan als prikklok dienen: open <strong>Inkloktablet</strong>. Medewerkers tikken hun naam aan en vullen hun pincode in. Wie nog geen pincode heeft, kiest die eerst op de eigen telefoon onder Inklokken.')],
  ] },
  { id: 'sops', app: 'team', title: "SOP's en checklists", routes: ['sops'], sections: [
    ['Werkwijzen', p("SOP's zijn de vaste werkwijzen: openen, sluiten, schoonmaken en meer. Ze staan per categorie; tik op een kaart om hem open te klappen.")],
    ['Afvinken', p('Vink af wat je gedaan hebt. Iedereen ziet direct hetzelfde. Om 00:00 staan alle lijsten weer leeg klaar. Op Vandaag zie je hoe ver elke lijst is.')],
    ['Maken en wijzigen (managers)', p("Met het potlood pas je een SOP aan: titel, categorie, uitleg en de punten om af te vinken. Met <strong>+</strong> maak je een nieuwe. SOP's kun je printen of als pdf delen.")],
  ] },
  { id: 'menu', app: 'team', title: 'Menu en gerechten', routes: ['menu'], sections: [
    ['De menupagina', p('Alle gerechten en dranken, met foto, uitleg en allergenen. Bovenaan staat het <strong>Gerecht van de maand</strong>. Filter op eten of drinken, categorie en seizoen.')],
    ['De gerechtendatabase', p('Elk gerecht staat één keer in de database, met een datum en seizoenen (voorjaar, zomer, najaar, winter). Daaruit stel je menukaarten en het menu van events samen. Een gerecht kan actief zijn (op de kaart) of in het archief.')],
    ['Een gerecht maken of wijzigen (managers)', ol('Tik op <strong>+</strong> of op het potlood bij een gerecht.', 'Vul in: eten of drinken, naam, categorie (bijvoorbeeld Lunch, Diner: voorgerecht, Zoet, Bakkerij), beschrijving, prijs, allergenen en seizoenen.', 'Foto: kies er een uit je fotobibliotheek, maak er een, of tik op <strong>Foto zoeken</strong>.', 'Sla op.') + tip('De categorie is belangrijk: bij events kies je eerst de categorie en dan het gerecht.')],
    ['Foto zoeken', p("<strong>Foto zoeken</strong> zoekt in vrije foto's (CC0 en publiek domein); die mag je gebruiken op de kaart en in de nieuwsbrief. Engelse zoekwoorden geven meer resultaat. De link naar Google Afbeeldingen is alleen voor inspiratie: die foto's zijn van iemand anders.")],
    ['Verwijderen en archief', p('Uitvinken haalt een gerecht van de kaart (naar het archief). Echt verwijderen kan in het archief, ook met meerdere tegelijk.')],
    ['Volgorde en gerecht van de maand', p('Onder Instellingen, Volgorde gerechten nummer je de gerechten (1 staat bovenaan) en kies je het gerecht van de maand.')],
  ] },
  { id: 'menucard', app: 'team', title: 'Menukaarten', routes: ['menucard'], sections: [
    ['Bekijken en delen', p('Tik op een menukaart (bijvoorbeeld lunch of diner) om hem schermvullend te zien. Met <strong>Delen</strong> stuur je de pdf via WhatsApp of mail, met <strong>PDF</strong> download je hem.')],
    ['Een kaart samenstellen (managers)', ol('Tik op het potlood.', 'Kies per onderdeel gerechten uit de database. Uitvinken haalt een gerecht echt weg.', 'Sleep gerechten in de goede volgorde.', 'Vul eventueel <strong>geldig van</strong> en <strong>tot</strong> in. Verlopen kaarten gaan naar het archief.') + tip('Pas je de naam van een gerecht aan, dan verandert hij op alle kaarten mee. Op de computer scrollen de kaart en het bewerkdeel los van elkaar.')],
  ] },
  { id: 'events', app: 'team', title: 'Events', routes: ['events'], sections: [
    ['Overzicht', p('Events staan in een lijst of een kalender. Een event is eerst een <strong>Optie</strong> (offerte) en daarna <strong>Bevestigd</strong>. Elk event heeft een BEO: één plek voor gast, gasten, menu, draaiboek, opstelling en geld. Bij elke wijziging bewaart de app een nieuwe versie (v1, v2…), met de wijzigingen erbij.')],
    ['Een event maken', ol('Tik op <strong>+ Nieuw event</strong>.', 'Vul de gast in: naam, bedrijf, telefoon, e-mail, factuurgegevens. Kies <strong>zakelijk</strong> of <strong>particulier</strong> (bepaalt hoe de btw op de offerte staat).', 'Vul datum, tijden, soort event en het aantal gasten in (verwacht, gegarandeerd, definitief).', 'Sla op. Wat je nog niet weet, vul je later in.') + tip('De app bewaart wat je typt als concept. Ga je per ongeluk weg, dan staat het er de volgende keer nog.')],
    ['Ruimtes en zaalhuur', p('Bij <strong>Ruimte en opstelling</strong> vink je de ruimtes aan. Bij elke ruimte komt de zaalhuur vanzelf bij de prijzen (21% btw); uitvinken haalt hem weg. Namen en standaardprijzen staan onder Instellingen, Ruimtes.') + p('Ruimtes van Mette: bij een event met eten en drinken factureren wij alles, ook de zaal. Mette factureert ons daarna de zaalhuur; dat bedrag zie je in Finance onder Zaalhuur voor Mette.')],
    ['Menu: eten en drinken', ol('Kies <strong>Gerecht toevoegen</strong> (eten) of <strong>Drank toevoegen</strong>.', 'Kies eerst de categorie. Bovenaan staan de categorieën uit het menu, daaronder andere gangen (zoals Borrel).', 'Kies daarna het gerecht. Je ziet alleen de gerechten uit die categorie; de allergenen komen vanzelf mee.', 'Of typ zelf een gerecht. Controleer dan zelf de allergenen.', 'Sleep regels aan het greepje (⠿) in de goede volgorde.') + p('De gangen pas je aan onder Instellingen, Gangen voor events.')],
    ['Alleen een zaal: offerte van Mette', p('Wil iemand alleen een ruimte huren, zonder eten en drinken? Kies bij Prijs en voorwaarden <strong>Offerte van: Mette te Velde, alleen zaalhuur</strong>. De offerte komt dan op haar naam en met haar gegevens, zonder ons logo, menu, allergieën en UVH. De mail is door haar ondertekend. Zij factureert zelf; in Finance telt het niet als onze omzet. Haar gegevens (adres, IBAN, KVK) vul je in onder Instellingen, Ruimtes.')],
    ['Dieetwensen en allergieën', p('Per wens: aantal, soort en eventueel voor wie. Namen bij allergieën staan op de keukenlijst, niet op de offerte. Ruim namen na het event op.')],
    ['Draaiboek', p('Tijden en wat er gebeurt, ook opbouw en afsluiten. De gast ziet op de offerte alleen de tijden tussen begin en einde van het event; het team ziet alles.')],
    ['Prijzen', p('Prijsregels zijn inclusief btw: eten en alcoholvrij 9%, alcohol en zaalhuur 21%. <strong>p.p.</strong> rekent met het aantal gasten. Met de knoppen (Diner p.p., Wijnarrangement p.p., Zaalhuur…) zet je snel een regel neer. Verder: minimale besteding, aanbetaling met datum, kurkengeld en extra betalingsafspraken.')],
    ['Offerte mailen', ol('Open het event en tik op <strong>Offerte mailen</strong> (of Bevestiging mailen).', 'De app maakt de pdf en opent het deelmenu. Kies Gmail of Mail.', 'Neem het adres en onderwerp bovenaan de tekst over in Aan en Onderwerp en haal die twee regels weg.') + tip('Versturen vanaf wintertuinrestaurant@gmail.com: log in de Gmail-app in met dat account, of kies het in het Van-veld. Op de computer downloadt de app de pdf en voeg je hem zelf toe.')],
    ['Printen: offerte, keukenlijst, bedieningslijst', p('Tik op <strong>Printen ▾</strong>: offerte of bevestiging (NL of EN), <strong>keukenlijst</strong> (menu, allergieën met namen, keukennotities) of <strong>bedieningslijst</strong>. Bij Events staat ook een leeg BEO-formulier om met de hand in te vullen.')],
    ['Wat er op de offerte staat', p('Logo en contactgegevens, een persoonlijke opening, gast en event, programma, menu, dieetwensen, opstelling, prijzen met btw en het bedrag per persoon, aanbetaling en betaling, en een verwijzing naar de UVH. De vaste teksten pas je aan onder Instellingen, Teksten offerte.')],
    ['Voorwaarden (UVH)', p('Op offertes en bevestigingen gelden de Uniforme Voorwaarden Horeca. Upload de UVH-pdf onder Instellingen, Bedrijfsgegevens: de link komt dan in de mail en op de offerte. De annuleringsregels volgens de UVH zie je in de app bij het event. Wat je anders afspreekt, zet je bij <strong>Aanvullende afspraken</strong>.')],
    ['Nieuwsbrief-toestemming', p('Op de offerte staat een vakje voor de nieuwsbrief. Zet het alleen aan als de gast ja zegt; de app bewaart wanneer.')],
  ] },
  { id: 'haccp', app: 'team', title: 'HACCP', routes: ['haccp'], sections: [
    ['Registreren', p('Per week zie je de registratielijsten volgens de Hygiënecode: temperaturen, ingangscontrole, bereiden en serveren, schoonmaakrooster, thermometers, hygiënecontrole, leveranciers en meer. Tik op een lijst en vul in; alles wordt meteen bewaard.')],
    ['Printen en archief', p('<strong>Print deze week</strong> maakt een pdf van alle lijsten, elke lijst op een eigen pagina. Managers vinden oude weken onder Instellingen, HACCP. Welke lijsten je gebruikt, stel je daar ook in.')],
  ] },
  { id: 'guests', app: 'team', title: 'Gasten en nieuwsbrief', routes: ['guests', 'newsletter'], sections: [
    ['Gastenlijst (managers)', p('Gasten uit events en losse aanmeldingen, met wie ja zei tegen de nieuwsbrief en wanneer. Met <strong>Deze gast vergeten</strong> haal je iemand weg (AVG). Exporteer de nieuwsbrieflijst als csv voor Brevo of Mailchimp.')],
    ['Nieuwsbrief maken', ol('Ga naar Nieuwsbrief.', 'Elk blok is te bewerken: titel, tekst, foto. Voeg blokken en categorieën toe of haal ze weg.', '<strong>Nu op de kaart</strong>: kies gerechten uit het menu, standaard zonder prijs.', 'Tik op <strong>HTML kopiëren</strong> en plak het in je mailprogramma (Brevo, Mailchimp of Gmail).') + p('Het concept wordt gedeeld door alle managers.')],
  ] },
  { id: 'about', app: 'team', title: 'Over ons en Links', routes: ['about', 'links'], sections: [
    ['Over ons', p('Het verhaal van de Wintertuin, het team en <strong>Over deze app</strong>. Managers passen de teksten aan en slepen de blokken in een andere volgorde (in de bewerkmodus).')],
    ['Links', p('Handige links voor iedereen, zoals de receptendatabase en Finance. Managers beheren ze onder Instellingen, Links.')],
  ] },
  { id: 'print', app: 'team', title: 'Printen, pdf en delen', routes: [], sections: [
    ['Zo werkt elke printknop', p('Elke printknop opent het blad schermvullend, met <strong>Delen</strong> (pdf via WhatsApp, mail of Bestanden), <strong>PDF</strong> (downloaden) en <strong>Printen</strong>. Op de iPhone-app print je via Delen, Afdrukken.')],
    ['Opmaak', p('Een kop staat nooit alleen onderaan een pagina, en tabelregels worden niet doormidden gesneden.')],
    ['Tik nog een keer', p('Zegt de app "De pdf is klaar. Tik nog een keer", dan wil de iPhone een verse tik. Tik dan nog een keer op dezelfde knop.')],
  ] },
  { id: 'settings', app: 'team', title: 'Instellingen (managers)', routes: ['settings'], sections: [
    ['Stappenplan', p('Wat er nog moet gebeuren voor de app helemaal klaar is: KVK- en btw-gegevens, KHN, UVH, Moneybird. Vinkt deels vanzelf af.')],
    ['Team en accounts', p('Accounts maken, rol kiezen (medewerker of manager), Finance-toegang, foto, nieuw wachtwoord. Met <strong>Account verwijderen</strong> verdwijnt een account zonder geschiedenis helemaal; met geschiedenis (HACCP, uren) wordt het gesloten en blijven de registraties bewaard. Met <strong>Medewerkersweergave</strong> zie je de app zoals een medewerker.')],
    ['Bedrijfsgegevens', p('Naam, adres, KVK, btw-nummer, IBAN, telefoon, e-mail, website, huisregels, geldigheid van offertes, betaaltermijn en de UVH-pdf. Dit komt op de offertes.')],
    ['Vaste diensten', p('Diensten die je vaak plant, met tijden en afdeling.')],
    ['Volgorde gerechten', p('Volgorde op de menupagina en het gerecht van de maand.')],
    ['Gangen voor events', p('De gangen bij het menu van een event: een lijst voor eten en een voor drinken, één per regel.')],
    ['Ruimtes', p('Naam, standaard zaalhuur (incl. 21% btw), maximaal aantal gasten en van wie de ruimte is: van Mette of van het restaurant. Ook de naam en gegevens van de verhuurder (adres, e-mail, telefoon, KVK, btw-nummer, IBAN), voor haar eigen offertes.')],
    ['Teksten offerte', p('De vaste teksten op offerte, bevestiging en in de mail, in het Nederlands en Engels. Woorden tussen accolades vult de app in: {voornaam}, {event}, {datum}, {de_offerte}, {geldig_tot}, {uvh_link}. Met Standaardtekst zet je een tekst terug.')],
    ['HACCP, Volgorde van de pagina\'s, Links', p('Welke HACCP-lijsten je gebruikt en het archief; de volgorde van de pagina\'s in de balk; de links voor iedereen.')],
    ['Systeemcheck en back-up', p('De systeemcheck test of alles werkt. Elke nacht komt er een back-up per mail (met wachtwoord): één van de Wintertuin-apps en één van de receptenapp.')],
    ['Handleiding', p('Deze handleiding. Ook te openen via het ?-icoontje rechtsboven.')],
  ] },
  // ---------------------------------------------------------------- Finance
  { id: 'fin-today', app: 'finance', title: 'Finance: dagafsluiting', routes: ['fin:today'], sections: [
    ['Elke dag invullen', ol('Kies <strong>Vandaag</strong>, <strong>Gisteren</strong> of <strong>Andere dag</strong>.', 'Stap 1: aantal gasten.', 'Stap 2: omzet per groep (ook de omzet van events).', 'Stap 3: inkoop, met de leveranciers als knoppen.', 'Stap 4 en 5: uren en afsluiten.') + p('Een gesloten dag hoef je niet in te vullen.')],
  ] },
  { id: 'fin-calendar', app: 'finance', title: 'Finance: kalender', routes: ['fin:calendar'], sections: [
    ['Open en dicht', p('Per dag zie je of er open is, het weer, events en of de dag is ingevuld. Tik op Open of Gesloten om een dag om te zetten (op de telefoon: het bolletje, groen is open). Met het potlood zet je een notitie. Tik op een dag om de dagafsluiting te openen.')],
  ] },
  { id: 'fin-month', app: 'finance', title: 'Finance: maand en week', routes: ['fin:month'], sections: [
    ['Maand', p('Het maandoverzicht: omzet, food cost en beverage cost (met de voorraadtelling), personeelskosten, prime cost, per dag, en vergelijking met andere maanden. Vul aan het einde van de maand de voorraadtelling in.')],
    ['Week', p('Met <strong>Maand | Week</strong> zie je één week: samenvatting, vergelijking met vorige week en dezelfde week vorig jaar, en de dagen. Food- en drankkosten per week zijn een schatting op basis van de inkopen.')],
    ['Zaalhuur voor Mette', p('Onder de maand staat <strong>Zaalhuur voor Mette</strong>: per event in haar ruimtes de zaalhuur. Bovenaan wat via ons gaat (Mette factureert ons dat bedrag), daaronder de offertes die Mette zelf maakt voor alleen een zaal (niet onze omzet). Haar factuur aan ons is een inkoopfactuur, straks in Moneybird.')],
  ] },
  { id: 'fin-dashboard', app: 'finance', title: 'Finance: dashboard en btw', routes: ['fin:dashboard', 'fin:vat'], sections: [
    ['Dashboard', p('De komende dagen (verwachte omzet en personeelskosten), events met aanbetalingen die nog moeten komen, de trend per maand, en kosten, break-even en budget.')],
    ['Btw per kwartaal', p('Btw over omzet min btw over inkoop, per kwartaal. Dit is indicatief; de officiële aangifte doet de boekhouder (straks via Moneybird).')],
  ] },
  { id: 'fin-settings', app: 'finance', title: 'Finance: instellingen', routes: ['fin:settings'], sections: [
    ['Wat je instelt', ul('<strong>Medewerkers en tarieven</strong>: uurtarieven (alleen managers zien ze).', '<strong>Omzetgroepen</strong> en <strong>Inkoopcategorieën</strong>: wat telt als food, beverage of non-food.', '<strong>Leveranciers</strong>: de knoppen bij inkoop.', '<strong>Btw-tarieven</strong>, <strong>Openingstijden</strong>, <strong>Sluitingsdagen</strong>.', '<strong>Doelen</strong> en <strong>Vaste kosten</strong> voor het dashboard en de break-even.', '<strong>Gebruikers</strong> en het <strong>Logboek</strong> van wijzigingen.')],
  ] },
];

// which chapter belongs to a page of the app
export function chapterFor(route, app = 'team') {
  const key = app === 'finance' ? `fin:${route}` : route;
  const c = CHAPTERS.find((x) => x.routes.includes(key));
  return c ? c.id : (app === 'finance' ? 'fin-today' : 'start');
}
