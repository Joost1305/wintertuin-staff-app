// Sample menu for the winter season: lunch (bakery café, Friday to Sunday) and a two-course table d'hôte dinner.
// Written in the spirit of bakery cafés we admire (Tartine, Bread 41, Sprout & Co, Honest Greens) and of our own
// manifesto: 80/20 plant forward, local, seasonal. Managers load it under Settings > Order of the dishes to test the app;
// the PDFs in demo/ show the same dishes. Allergens follow the 14 EU allergens; check them against the real recipes.
// Example photos: Pexels (free to use, no attribution needed). Replace them with your own photos via Edit.
const px = (id) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=900`;

export const SAMPLE_MENU = [
  // ---------------------------------------------------------------- bakery (morning and lunch)
  { name: 'Ochtendbroodje met kardemom', photo_url: px(4828349), category: 'Bakkerij', group_type: 'food', price: 3.75, allergens: ['gluten', 'milk', 'eggs'],
    description: 'Croissantdeeg, opgerold met kardemomsuiker en sinaasappelschil, gebakken tot de randen karamelliseren.\nEN: Laminated dough rolled with cardamom sugar and orange zest, baked until the edges caramelise.' },
  { name: 'Croissant', photo_url: px(3892469), category: 'Bakkerij', group_type: 'food', price: 3.25, allergens: ['gluten', 'milk', 'eggs'],
    description: 'Roomboter, drie dagen deeg. Elke ochtend vers uit onze eigen bakkerij.\nEN: All butter, a three-day dough, fresh from our own bakery every morning.' },
  { name: 'Cruffin met appel en kaneel', photo_url: px(6625812), category: 'Bakkerij', group_type: 'food', price: 4.25, allergens: ['gluten', 'milk', 'eggs'],
    description: 'Croissantdeeg in een muffinvorm, gevuld met appelcompote van Elstar uit de Betuwe en gerold door kaneelsuiker.\nEN: Croissant dough baked in a muffin tin, filled with Elstar apple compote, rolled in cinnamon sugar.' },
  { name: 'Deense koek met kaneel', photo_url: px(38354172), category: 'Bakkerij', group_type: 'food', price: 3.75, allergens: ['gluten', 'milk', 'eggs'],
    description: 'Gelaagd Deens deeg met kaneelboter, gedraaid en glanzend afgebakken.\nEN: Laminated Danish dough with cinnamon butter, twisted and glazed.' },
  { name: 'Zuurdesem met boter en honing', photo_url: px(4109515), category: 'Bakkerij', group_type: 'food', price: 6.5, allergens: ['gluten', 'milk'],
    description: 'Een dikke snee van ons landbrood, gekarnde boter en honing van onze eigen bijen.\nEN: A thick slice of our country loaf, cultured butter and honey from our own hives.' },

  // ---------------------------------------------------------------- lunch
  { name: 'Wortel-gembersoep', photo_url: px(15108369), category: 'Lunch', group_type: 'food', price: 8.5, allergens: ['gluten', 'celery'],
    description: 'Romig zonder room, met kruidenolie en zuurdesemkruim. Plantaardig. Met een snee brood.\nEN: Creamy without cream, with herb oil and sourdough crumbs. Plant-based. Served with bread.' },
  { name: 'Tartine met gerookte forel', photo_url: px(9671541), category: 'Lunch', group_type: 'food', price: 14, allergens: ['gluten', 'milk', 'fish'],
    description: 'Geroosterd landbrood, crème fraîche, warm gerookte forel, ingelegde rode ui, dille en citroen.\nEN: Toasted country bread, crème fraîche, hot-smoked trout, pickled red onion, dill and lemon.' },
  { name: 'Bieten-kikkererwtendip', photo_url: px(1618898), category: 'Lunch', group_type: 'food', price: 9.5, allergens: ['gluten', 'sesame'],
    description: 'Geroosterde biet en kikkererwt, gomasio van loofgroen en sesam, met zuurdesem om te dippen. Plantaardig.\nEN: Roasted beetroot and chickpea dip with green-top gomasio and sesame, sourdough for dipping. Plant-based.' },
  { name: 'Hartige pap met paddenstoelen', photo_url: px(6823336), category: 'Lunch', group_type: 'food', price: 13.5, allergens: ['gluten', 'eggs', 'soy', 'sesame', 'celery'],
    description: 'Parelgort en rijst, paddenstoelenconfit, ons eigen zuurgoed, een zacht gekookt ei en gomasio.\nEN: Pearl barley and rice porridge, mushroom conserva, house pickles, a soft-boiled egg and gomasio.' },
  { name: 'Tosti met oude kaas en kimchi', photo_url: px(14941252), category: 'Lunch', group_type: 'food', price: 11.5, allergens: ['gluten', 'milk', 'sesame'],
    description: 'Landbrood uit de pan met oude boerenkaas, huiskimchi van spitskool en gebrande ui. Vegetarisch.\nEN: Pan-toasted country bread with aged farmhouse cheese, house pointed-cabbage kimchi and burnt onion. Vegetarian.' },
  { name: 'Marktbord met pompoen en linzen', photo_url: px(35763746), category: 'Lunch', group_type: 'food', price: 15.5, allergens: ['sesame', 'mustard'],
    description: 'Geroosterde pompoen, beluga-linzen, gestoofde boerenkool, tahin-yoghurt van haver en granaatappel. Plantaardig.\nEN: Roasted squash, beluga lentils, braised kale, oat tahini yoghurt and pomegranate. Plant-based.' },
  { name: 'Geroosterde scharrelkip', photo_url: px(19615783), category: 'Lunch', group_type: 'food', price: 17.5, allergens: ['gluten', 'milk', 'celery', 'fish', 'mustard'],
    description: 'Halve kip van een boer uit de Gelderse Vallei, knolselderijpuree, salsa verde met ansjovis en een snee brood.\nEN: Half a free-range chicken, celeriac purée, salsa verde with anchovy, and bread.' },
  { name: 'Witlofsalade met peer en walnoot', photo_url: px(13760156), category: 'Lunch', group_type: 'food', price: 13.5, allergens: ['gluten', 'eggs', 'milk', 'nuts', 'mustard'],
    description: 'Rode en witte witlof, gepofte peer, spelt, geroosterde walnoot en green goddess-dressing met kruiden uit de kas.\nEN: Red and white chicory, baked pear, spelt, toasted walnut and a green goddess dressing with greenhouse herbs.' },

  { name: 'Borrelplank', photo_url: px(6660071), category: 'Borrel', group_type: 'food', price: 16.5, allergens: ['gluten', 'milk', 'mustard', 'sulphites', 'nuts'],
    description: 'Ons eigen brood, boerenkaas, worst uit de regio, pickles uit de kelder, mosterd en geroosterde noten. Vanaf 15:00, voor twee.\nEN: Our own bread, farmhouse cheese, local sausage, house pickles, mustard and roasted nuts. From 3 pm, for two.' },

  // ---------------------------------------------------------------- sweet
  { name: 'Baskische cheesecake met peer', photo_url: px(1126359), category: 'Zoet', group_type: 'food', price: 6, allergens: ['milk', 'eggs', 'gluten'],
    description: 'Verbrand aan de buitenkant, zacht van binnen. Met gepocheerde stoofpeer.\nEN: Burnt outside, soft inside. With poached stewing pear.' },
  { name: 'Chocolade-hazelnootcake', photo_url: px(30128890), category: 'Zoet', group_type: 'food', price: 5.5, allergens: ['gluten', 'nuts', 'soy'],
    description: 'Plantaardige chocoladecake met geroosterde hazelnoot en een snufje zout.\nEN: Plant-based chocolate cake with roasted hazelnut and a pinch of salt.' },

  // ---------------------------------------------------------------- dinner, winter table d'hôte: two courses for a set price
  { name: 'Gegrilde prei met hazelnoot', photo_url: px(5794), category: 'Diner: voorgerecht', group_type: 'food', price: null, allergens: ['milk', 'eggs', 'nuts'],
    description: 'Prei van het vuur, beurre noisette, geroosterde hazelnoot en geraspte gezouten eidooier.\nEN: Fire-grilled leek, brown butter, toasted hazelnut and grated cured egg yolk.' },
  { name: 'Bietencarpaccio met geitenkwark', photo_url: px(3649535), category: 'Diner: voorgerecht', group_type: 'food', price: null, allergens: ['milk'],
    description: 'Dun gesneden gezouten biet, geitenkwark, gebrande boekweit en dragon. Vegetarisch.\nEN: Thinly sliced salt-baked beetroot, goat curd, toasted buckwheat and tarragon. Vegetarian.' },
  { name: 'Paddenstoelenbouillon', photo_url: px(27892041), category: 'Diner: voorgerecht', group_type: 'food', price: null, allergens: ['celery', 'soy'],
    description: 'Heldere bouillon van gedroogde en verse paddenstoelen, gefermenteerde knoflook en lavas. Plantaardig.\nEN: Clear broth of dried and fresh mushrooms, fermented garlic and lovage. Plant-based.' },
  { name: 'Knolselderij uit de zoutkorst', photo_url: px(10112735), category: 'Diner: hoofdgerecht', group_type: 'food', price: null, allergens: ['celery', 'eggs'],
    description: 'Hele knolselderij in een korst van zout gegaard, zwarte knoflook, appel en kruidenolie. Vegetarisch.\nEN: Whole celeriac baked in a salt crust, black garlic, apple and herb oil. Vegetarian.' },
  { name: 'Gerstotto met pompoen en salie', photo_url: px(6406460), category: 'Diner: hoofdgerecht', group_type: 'food', price: null, allergens: ['gluten', 'milk', 'celery'],
    description: 'Parelgort als risotto, geroosterde pompoen, gebakken salie en oude kaas. Vegetarisch.\nEN: Pearl barley cooked like risotto, roasted squash, fried sage and aged cheese. Vegetarian.' },
  { name: 'Hertenstoof met rode kool', photo_url: px(8952367), category: 'Diner: hoofdgerecht', group_type: 'food', price: null, allergens: ['celery', 'sulphites', 'milk'],
    description: 'Wild uit de omgeving, langzaam gestoofd met jeneverbes, rode kool en pastinaak.\nEN: Local game, slowly braised with juniper, red cabbage and parsnip.' },
  { name: 'Snoekbaars met zuurkool', photo_url: px(11513615), category: 'Diner: hoofdgerecht', group_type: 'food', price: null, allergens: ['fish', 'milk', 'sulphites'],
    description: 'Gebakken snoekbaars, eigen zuurkool, beurre blanc en kleine aardappels.\nEN: Pan-fried pike-perch, house sauerkraut, beurre blanc and small potatoes.' },
  { name: 'Rijstpudding met honing en peer', photo_url: px(116725), category: 'Diner: nagerecht', group_type: 'food', price: null, allergens: ['milk'],
    description: 'Romige rijstpudding met honing van onze bijen en gepofte stoofpeer.\nEN: Creamy rice pudding with honey from our bees and baked stewing pear.' },
  { name: 'Appeltaartje met bruine boter', photo_url: px(4018839), category: 'Diner: nagerecht', group_type: 'food', price: null, allergens: ['gluten', 'milk', 'eggs'],
    description: 'Dun appeltaartje met bruine boter en crème fraîche.\nEN: A thin apple tart with brown butter and crème fraîche.' },

  // ---------------------------------------------------------------- drinks
  { name: 'Flat white', photo_url: px(13623762), category: 'Koffie', group_type: 'beverage', price: 3.8, allergens: ['milk'],
    description: 'Dubbele ristretto met zacht opgeschuimde melk. Haver of soja op verzoek.\nEN: Double ristretto with silky milk. Oat or soy on request.' },
  { name: 'Filterkoffie van de dag', photo_url: px(29498509), category: 'Koffie', group_type: 'beverage', price: 3.5, allergens: [],
    description: 'Zelf gebrande boon, elke dag een andere herkomst. Vraag welke.\nEN: Roasted by us, a different origin every day. Ask which one.' },
  { name: 'Chai met havermelk', photo_url: px(3151775), category: 'Koffie', group_type: 'beverage', price: 4.5, allergens: ['gluten'],
    description: 'Eigen kruidenmix, getrokken op havermelk.\nEN: House spice blend, brewed with oat milk.' },
  { name: 'Verse muntthee met honing', photo_url: px(5275234), category: 'Thee en fris', group_type: 'beverage', price: 3.5, allergens: [],
    description: 'Munt uit de kas, honing van onze bijen.\nEN: Mint from the greenhouse, honey from our bees.' },
  { name: 'Kombucha van het huis', photo_url: px(733768), category: 'Thee en fris', group_type: 'beverage', price: 4.5, allergens: [],
    description: 'Zelf gefermenteerd, smaak wisselt met het seizoen.\nEN: Fermented in house, the flavour follows the season.' },
  { name: 'Appelsap uit de Betuwe', photo_url: px(8215113), category: 'Thee en fris', group_type: 'beverage', price: 3.75, allergens: [],
    description: 'Troebel, van één boomgaard.\nEN: Cloudy, from a single orchard.' },
  { name: 'Natuurwijn per glas', photo_url: px(6580415), category: 'Wijn en bier', group_type: 'beverage', price: 6.5, allergens: ['sulphites'],
    description: 'Rood, wit of oranje van kleine makers. Vraag wat er open is.\nEN: Red, white or orange from small makers. Ask what is open.' },
  { name: 'Speciaalbier uit de regio', photo_url: px(5659493), category: 'Wijn en bier', group_type: 'beverage', price: 5.5, allergens: ['gluten'],
    description: 'Wisselend tapbier van een brouwerij in de buurt.\nEN: A rotating beer from a brewery nearby.' },
];

// PDFs shipped with the app (made from the menu above); registered as menu PDFs by the same button
export const SAMPLE_PDFS = [
  { label: 'Lunchkaart', path: 'site:demo/wintertuin-lunchkaart.pdf' },
  { label: 'Dinerkaart', path: 'site:demo/wintertuin-dinerkaart.pdf' },
  { label: 'Allergenenkaart', path: 'site:demo/wintertuin-allergenen.pdf' },
];
