# Wintertuin, team app

Een webapp voor het team: SOP's, menu, links (recepten/financi&euml;n), rooster, inklokken, en dienstruil.

## Wat er al staat

Een nieuw, apart Supabase-project genaamd **wintertuin-staff-app** is al aangemaakt en volledig ingericht:

- project-URL: `https://foaoyjxzclvvdhuxvsck.supabase.co`
- tabellen: `profiles`, `sops`, `menu_items`, `resources`, `shifts`, `shift_swap_requests`, `checkins`
- rijbeveiliging (RLS) staat aan: iedereen ingelogd kan lezen, alleen managers kunnen SOP's/menu/links/rooster bewerken, medewerkers kunnen alleen hun eigen ruilverzoeken en check-ins aanmaken.
- de `anon`-sleutel in `config.js` is bewust openbaar, die geeft alleen toegang tot wat de beveiligingsregels toestaan.

## Live zetten (GitHub Pages, gratis)

1. Maak een nieuwe repository op GitHub, bijvoorbeeld `wintertuin-team`.
2. Upload deze 6 bestanden naar de root: `index.html`, `app.js`, `app_sops_menu.js`, `app_links_roster.js`, `app_checkin_swap.js`, `config.js`.
3. Ga naar **Settings &rarr; Pages**, kies "Deploy from branch", branch `main`, map `/ (root)`.
4. Na een paar minuten is de app te vinden op `https://<jouw-gebruikersnaam>.github.io/wintertuin-team/`.

Elke medewerker kan die link openen op telefoon of tablet.

## Jezelf manager maken

Iedereen die zich aanmeldt krijgt automatisch de rol `staff`. Maak jezelf de eerste manager door dit eenmalig uit te voeren in de Supabase SQL-editor van het project (Dashboard &rarr; SQL Editor):

```sql
update public.profiles set role = 'manager' where email_matches_your_account;
-- makkelijker: zoek jezelf op naam en zet role op 'manager':
update public.profiles set role = 'manager' where full_name = 'Joost';
```

Vervang `'Joost'` door de naam die je bij het aanmaken van je account hebt ingevuld. Daarna kun je via de app zelf ook collega's tot manager maken door in diezelfde SQL-editor hun rij te updaten (er is nog geen knop voor in de app zelf).

## Wat elke sectie doet nu

- **SOP's**: categorie&euml;n met tekst en/of een afvinklijst. Alleen managers kunnen toevoegen/bewerken. De afvinkjes zijn nu per bezoek, niet per dienst opgeslagen; dat kan een latere uitbreiding zijn.
- **Menu**: gerechten met foto (URL), optionele embedded video (plak een YouTube/Vimeo "embed"-link), beschrijving en prijs.
- **Links**: vrije lijst van links, bedoeld voor de wachtwoordbeveiligde receptendatabase en het financi&euml;n-bestand. Voeg deze zelf toe via de app (als manager) zodra je de definitieve links hebt.
- **Rooster**: een echte weekkalender, net als een Teams/Outlook-agenda. Eigen diensten staan in een kleur, collega's in grijs. Klik links/rechts om van week te wisselen. Managers klikken op "+ dienst" onder een dag om iemand in te plannen, of op een bestaande dienst om die te bewerken of te verwijderen. Onderaan staat een uren-overzicht dat het geplande rooster naast de echt ingeklokte uren zet.
- **Vaste diensten en slepen**: managers maken "vaste diensten" aan (bijv. "Ochtend bakkerij, 07:00-15:00") en slepen die met de muis op een dag bij een medewerker om meteen in te plannen. Bestaande diensten in het rooster zijn ook te verslepen naar een andere dag of medewerker, in plaats van het bewerkformulier te openen.
- **Agenda-export en printen**: "Download mijn maand (.ics)" zet je eigen diensten van de huidige maand in een bestand dat je in Google Agenda, Apple Agenda of Outlook kunt importeren. Managers hebben ook "Download hele team (.ics)" voor het complete teamrooster. "Print: wie werkt vandaag" opent het printvenster van de browser met een nette lijst van wie er vandaag werkt, zodat je die kunt uitprinten of als PDF opslaan (kies in het printvenster "Opslaan als PDF" in plaats van een printer).
- **Inklokken**: een grote in/uit-knop per medewerker, met eigen geschiedenis.
- **Ruilen**: een medewerker biedt een eigen dienst aan, een collega neemt hem over, een manager keurt goed of af. Pas na goedkeuring verandert het rooster echt.

## Wat er sinds de eerste versie is toegevoegd

- **Foto's uploaden**: het menu-formulier heeft nu een bestandsveld in plaats van een URL. Foto's gaan naar een Supabase Storage-bucket (`menu-photos`, openbaar leesbaar, alleen managers kunnen uploaden/verwijderen).
- **Checklist-status per dag**: vinkjes bij SOP's worden nu opgeslagen in de tabel `sop_checks`, per SOP-item en per datum. Elke nieuwe dag begint de lijst weer leeg.
- **Team-scherm**: managers hebben een nieuwe tab "Team" waar ze de rol (staff/manager) en actief-status van elke medewerker kunnen aanpassen, zonder de Supabase SQL-editor te openen. Je kunt jezelf daar niet aanpassen, dat voorkomt dat je jezelf per ongeluk buitensluit.
- **Accounts en wachtwoorden beheren**: managers kunnen in dat Team-scherm ook nieuwe accounts aanmaken en bestaande wachtwoorden resetten, direct vanuit de app. Na het aanmaken of resetten verschijnt een kaartje met de inloggegevens, met een "Kopieer"-knop en een "Deel via WhatsApp"-knop. Dat wachtwoord wordt maar één keer getoond, dus kopieer of deel het meteen. Dit werkt via een kleine server-functie (Supabase Edge Function `admin-users`) die los van de app draait; de app zelf heeft nooit toegang tot wachtwoorden van anderen, alleen die functie mag ze aanpassen, en alleen voor managers.
- **Meldingen**: een rood bolletje op de "Ruilen"-tab laat zien hoeveel dingen op je wachten (openstaande ruilen voor medewerkers, goed te keuren ruilen voor managers). Dit ververst elke minuut vanzelf. Dit is een teller binnen de app zelf, geen echte e-mail of pushmelding op je telefoon; dat vereist een los e-mailaccount (bijvoorbeeld Resend) met een API-sleutel. Zeg het als je dat alsnog wilt, dan zet ik dat erbovenop.

## Wat nog een vervolgstap is

- Echte e-mail- of pushmeldingen buiten de app om (zie hierboven).
- SOP's herordenen via slepen in plaats van alleen toevoegen.
- Eigen inlogpagina voor het team zonder open zelfregistratie (nu kan iedereen met de link een account aanmaken; dat kan later dichtgezet worden, bijvoorbeeld door zelfregistratie uit te zetten en managers accounts te laten aanmaken).
