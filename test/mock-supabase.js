// In-memory stand-in for supabase-js, used only by test/ui-test.cjs. Mimics the queries the app makes,
// including joins like profiles:staff_id(full_name). Security is not mocked.
(function () {
  const uid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); });
  const role = window.__MOCK_ROLE || 'manager';
  const iso = (d) => d.toLocaleDateString('sv-SE');
  const ME = uid();
  const people = [[ME, 'Joost', role], [uid(), 'Anna', 'staff'], [uid(), 'Sam', 'staff']];
  const db = {
    profiles: people.map(([id, full_name, r]) => ({ id, full_name, role: r, active: true, email: full_name.toLowerCase() + '@example.test', language: 'en' })),
    sops: [{ id: uid(), category: 'Opening', title: 'Morning check kitchen', content: 'Before 08:00', items: ['Coffee machine on', 'Terrace cushions out'], sort_order: 0 },
           { id: uid(), category: 'Closing', title: 'Close bar', content: '', items: ['Clean grinder'], sort_order: 0 }],
    sop_checks: [], resources: [{ id: uid(), label: 'Recipe database', url: 'https://example.test', note: 'Ask Joost', sort_order: 0 }],
    menu_items: [{ id: uid(), name: 'Sourdough', category: 'bakery', group_type: 'food', price: 6.5, description: 'Our own bread', active: true, sort_order: 0 },
                 { id: uid(), name: 'Flat white', category: 'coffee', group_type: 'beverage', price: 3.8, description: '', active: true, sort_order: 0 }],
    shift_templates: [{ id: uid(), name: 'Morning bakery', start_time: '07:00:00', end_time: '15:00:00', section: 'Bakery', sort_order: 0 }],
    shifts: [], checkins: [], shift_swap_requests: [],
  };
  const today = new Date();
  for (let i = 0; i < 4; i++) { const d = new Date(today); d.setDate(d.getDate() + i);
    db.shifts.push({ id: uid(), staff_id: people[i % 3][0], shift_date: iso(d), start_time: '09:00:00', end_time: '17:00:00', section: 'Restaurant' }); }
  db.shift_swap_requests.push({ id: uid(), shift_id: db.shifts[1].id, requested_by: people[1][0], status: 'open', reason: 'Exam', created_at: new Date().toISOString() });
  window.__mockdb = db;

  const JOIN = { staff_id: 'profiles', requested_by: 'profiles', claimed_by: 'profiles', shift_id: 'shifts' };
  function project(row, sel) {
    if (!sel || sel === '*') return { ...row };
    const out = { ...row };
    for (const m of sel.matchAll(/(\w+)(?::(\w+))?\(([^)]*)\)/g)) {
      const [, a, b, cols] = m;
      const alias = b ? a : a; const fk = b || (a === 'shifts' ? 'shift_id' : a);
      const table = JOIN[fk] || a;
      const hit = (db[table] || []).find((x) => x.id === row[fk]);
      out[alias] = hit ? Object.fromEntries(cols.split(',').map((c) => c.trim()).map((c) => [c, hit[c]])) : null;
    }
    return out;
  }
  class Q {
    constructor(t) { this.t = t; this.f = []; this.ord = []; this.op = 'select'; }
    select(sel, opts) { if (this.op === 'select') { this.sel = sel; this.head = opts && opts.head; } return this; }
    eq(k, v) { this.f.push((r) => String(r[k]) === String(v)); return this; }
    neq(k, v) { this.f.push((r) => String(r[k]) !== String(v)); return this; }
    is(k, v) { this.f.push((r) => (r[k] ?? null) === v); return this; }
    in(k, vs) { this.f.push((r) => vs.includes(r[k])); return this; }
    gte(k, v) { this.f.push((r) => r[k] >= v); return this; }
    lte(k, v) { this.f.push((r) => r[k] <= v); return this; }
    lt(k, v) { this.f.push((r) => r[k] < v); return this; }
    order(k, o) { this.ord.push([k, !(o && o.ascending === false)]); return this; }
    limit(n) { this.lim = n; return this; }
    maybeSingle() { this.one = 'maybe'; return this; }
    single() { this.one = 'single'; return this; }
    insert(rows) { this.op = 'insert'; this.rows = [].concat(rows); return this; }
    update(p) { this.op = 'update'; this.patch = p; return this; }
    upsert(rows, o) { this.op = 'upsert'; this.rows = [].concat(rows); this.conflict = ((o && o.onConflict) || 'id').split(','); return this; }
    delete() { this.op = 'delete'; return this; }
    run() {
      const tbl = db[this.t] || (db[this.t] = []);
      const match = (r) => this.f.every((fn) => fn(r));
      let out = [];
      if (this.op === 'select') out = tbl.filter(match);
      const DEF = { menu_items: { active: true, sort_order: 0 }, profiles: { active: true } };
      if (this.op === 'insert') for (const r of this.rows) { const row = { id: uid(), created_at: new Date().toISOString(), ...(DEF[this.t] || {}), ...r }; tbl.push(row); out.push(row); }
      if (this.op === 'update') for (const r of tbl.filter(match)) { Object.assign(r, this.patch); out.push(r); }
      if (this.op === 'upsert') for (const r of this.rows) { const hit = tbl.find((x) => this.conflict.every((k) => String(x[k]) === String(r[k]))); if (hit) Object.assign(hit, r); else tbl.push({ id: uid(), ...r }); }
      if (this.op === 'delete') for (let i = tbl.length - 1; i >= 0; i--) if (match(tbl[i])) tbl.splice(i, 1);
      if (this.head) return { data: null, count: out.length, error: null };
      for (const [k, asc] of [...this.ord].reverse()) out.sort((a, b) => ((a[k] ?? '') > (b[k] ?? '') ? 1 : (a[k] ?? '') < (b[k] ?? '') ? -1 : 0) * (asc ? 1 : -1));
      if (this.lim) out = out.slice(0, this.lim);
      out = JSON.parse(JSON.stringify(out.map((r) => project(r, this.sel))));
      if (this.one === 'single') return out.length === 1 ? { data: out[0], error: null } : { data: null, error: { message: 'Expected one row' } };
      if (this.one === 'maybe') return { data: out[0] || null, error: null };
      return { data: out, error: null };
    }
    then(res, rej) { let r; try { r = this.run(); } catch (e) { r = { data: null, error: { message: e.message } }; } return Promise.resolve(r).then(res, rej); }
  }
  const SKEY = 'mock-session';
  if (/access_token=/.test(location.hash)) { localStorage.setItem(SKEY, '1'); setTimeout(() => { location.hash = ''; }, 50); }
  const client = {
    from: (t) => new Q(t),
    rpc: async () => ({ data: null, error: null }),
    storage: { from: () => ({ upload: async () => ({ data: {}, error: null }), getPublicUrl: (p) => ({ data: { publicUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' } }) }) },
    functions: { invoke: async (name, { body }) => {
      if (body.action === 'create') db.profiles.push({ id: uid(), full_name: body.full_name, email: body.email, role: 'staff', active: true, language: 'en' });
      return { data: { ok: true }, error: null };
    } },
    auth: {
      getSession: async () => ({ data: { session: localStorage.getItem(SKEY) ? { user: { id: ME, email: 'joost@example.test' } } : null } }),
      signInWithPassword: async ({ password }) => { if (password !== 'test') return { data: null, error: { message: 'Invalid login credentials' } }; localStorage.setItem(SKEY, '1'); return { data: {}, error: null }; },
      signUp: async () => ({ data: {}, error: null }),
      signOut: async () => { localStorage.removeItem(SKEY); return { error: null }; },
      resetPasswordForEmail: async () => ({ data: {}, error: null }),
      updateUser: async () => ({ data: {}, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  };
  window.supabase = { createClient: () => client };
})();
