"""Builds the static data page of the paper into docs/ (GitHub Pages: deploy from /docs).
usage: python build.py [PAPER_REPO]
  PAPER_REPO  clone of TI_homogenization_paper (default: ../TI_homogenization_paper). Read from it:
              data/hd_snapshot_2026-11-13.tgz, data/hd_snapshot_2026-11-17_mesh.tgz, figures/nn/nn_curves.json,
              figures/fig_mises_*.png, figures/fig_hexrve.pdf (to PNG with pdftocairo, if on PATH).
Only the standard library. Copies src/ to docs/ and writes docs/data/ (site.json, one JSON per configuration, CSV
tables, a zip of all configurations) and docs/img/. The output is meant for readers of the paper: it carries no
registry identifiers, hosts or tool settings, only the model, the results and readable configuration names."""
import csv, json, math, os, shutil, subprocess, sys, tarfile, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
PAPER = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'TI_homogenization_paper'))
SRC, OUT = os.path.join(HERE, 'src'), os.path.join(HERE, 'docs')
SNAP_MAIN, SNAP_MESH = 'hd_snapshot_2026-11-13.tgz', 'hd_snapshot_2026-11-17_mesh.tgz'
TESTS = [('axial_ut', 'axial tension, strain 11'), ('transverse_axial_ut', 'transverse tension, strain 22'),
         ('transverse_axial_33', 'transverse tension, strain 33'), ('transverse_longitudinal_shear', 'transverse shear, strain 23'),
         ('longitudinal_shear_13', 'longitudinal shear, strain 13'), ('longitudinal_shear', 'longitudinal shear, strain 12')]
ZERO = [(i, j) for i in range(6) for j in range(6) if i != j and not (i < 3 and j < 3)]
PARAMS = ['lambda', 'mu_T', 'mu_L', 'gamma', 'beta']
VOGLER = ['lambda', 'mu_T', 'mu_L', 'alpha', 'beta']
S = 0.05  # cell edge


def tgz(name):
    """{member path: bytes} of a snapshot archive (paths without the leading hd_snapshot/)."""
    out = {}
    with tarfile.open(os.path.join(PAPER, 'data', name)) as t:
        for m in t.getmembers():
            if m.isfile():
                n = m.name.split('hd_snapshot/', 1)[-1]
                out[n[2:] if n.startswith('./') else n] = t.extractfile(m).read()
    return out


def jl(files, path):
    return json.loads(files[path])


def r(v, n=10):
    """v rounded to n significant digits (keeps the JSON small, far beyond plotting accuracy)."""
    if v is None or isinstance(v, bool) or not isinstance(v, (int, float)) or v == 0 or not math.isfinite(v):
        return v
    return round(v, n - 1 - int(math.floor(math.log10(abs(v)))))


def rr(o, n=10):
    if isinstance(o, dict):
        return {k: rr(v, n) for k, v in o.items()}
    if isinstance(o, list):
        return [rr(v, n) for v in o]
    return r(o, n)


def checks(C):
    """e_TI, e_c, e_s of Eq. ti_checks (Sec. 3.4)."""
    d = lambda i, j: math.sqrt(abs(C[i][i] * C[j][j]))
    return dict(e_TI=abs(C[1][1] - C[1][2] - 2 * C[3][3]) / (2 * C[3][3]),
                e_c=max(abs(C[i][j]) / d(i, j) for i, j in ZERO),
                e_s=max(abs(C[i][j] - C[j][i]) / d(i, j) for i in range(6) for j in range(i + 1, 6)),
                C13_C12=abs(C[0][2] / C[0][1] - 1), C33_C22=abs(C[2][2] / C[1][1] - 1), C55_C66=abs(C[4][4] / C[5][5] - 1))


def fiber_name(E):
    return 'E-glass' if E < 1e5 else 'carbon'


def slug(fiber, matrix, rho, sh=None):
    """Readable configuration name, e.g. carbon-ogden-0.40 (other meshes: carbon-ogden-0.40-sh25)."""
    base = '%s-%s-%.2f' % (fiber.lower(), matrix.replace('_', '-'), rho)
    return base if sh is None else '%s-sh%g' % (base, sh)


def record(c):
    """One configuration as a reader sees it: model, stiffness, checks, tests, identified parameters."""
    cfg, ds = c['config'], c['dataset']
    fiber, matrix, rho = fiber_name(cfg['materials']['fiber']['params']['E']), cfg['materials']['matrix']['model'], cfg['fiber_volume_fraction']
    h = cfg['mesh']['seed']
    sh = round(S / h, 2)
    C = ds['C']
    raw = ds.get('raw') or {}
    tests = []
    for key, name in TESTS:
        x = raw.get(key, {})
        hm = (x.get('checks') or {}).get('hill_mandel') or {}
        tests.append(dict(test=name, strain=x.get('strain'), stress=x.get('stress_voigt'), column=x.get('column'),
                          hill_mandel_error=hm.get('rel_error', hm.get('relative_error')),
                          stress_asymmetry=(x.get('checks') or {}).get('stress_asymmetry')))
    fits = c.get('fits') or {}
    fit = lambda key, names: {k: ((fits.get(key) or {}).get('params') or {}).get(k) for k in names}
    err = lambda key: ((fits.get(key) or {}).get('residuals') or {}).get('max_rel_error')
    eng = {k: v for k, v in (ds.get('engineering_constants') or {}).items() if k in ('E1', 'E2', 'nu12', 'nu23', 'mu12', 'mu23')}
    diag = ds.get('stiffness_diagnostics') or {}
    return dict(
        id=slug(fiber, matrix, rho, None if abs(sh - 50) < 1e-6 else sh),
        fiber=fiber, matrix=matrix, rho=rho, h=h, s_h=sh, s=cfg['geometry']['a'], L=cfg['geometry']['L'],
        element=cfg['mesh']['element'], strain=cfg['loading']['strain'],
        C=C, checks=checks(C), engineering=eng, positive_definite=diag.get('positive_definite'), eigenvalues=diag.get('eigenvalues'),
        tests=tests, proposed=fit('proposed_small_strain', PARAMS), proposed_error=err('proposed_small_strain'),
        vogler=fit('vogler_small_strain', VOGLER), vogler_error=err('vogler_small_strain'))


def summary(x):
    C = x['C']
    return rr(dict(id=x['id'], rho=x['rho'], fiber=x['fiber'], matrix=x['matrix'], seed=x['h'],
                   C=[C[0][0], C[1][1], C[0][1], C[1][2], C[3][3], C[5][5]], checks=x['checks'],
                   proposed=x['proposed'], vogler=x['vogler']), 10)


def write_csv(path, head, rows):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(head)
        w.writerows([[r(v, 10) if isinstance(v, float) else v for v in row] for row in rows])


def main():
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    shutil.copytree(SRC, OUT)
    for d in ('data/configurations', 'img'):
        os.makedirs(os.path.join(OUT, d), exist_ok=True)

    main_files, mesh_files = tgz(SNAP_MAIN), tgz(SNAP_MESH)
    cases = [record(c) for c in jl(main_files, 'studies/STUDY-486d0f75.flow.json')['cases']]
    mcases = [record(c) for c in jl(mesh_files, 'studies/STUDY-bdfb3b99.flow.json')['cases']]
    main_ids = {x['id'] for x in cases}
    files = {}
    for x in cases + [m for m in mcases if m['id'] not in main_ids]:  # the s/50 mesh is the main configuration
        files[x['id']] = json.dumps(rr(x, 12), separators=(',', ':'))
        open(os.path.join(OUT, 'data/configurations', x['id'] + '.json'), 'w').write(files[x['id']])
    with zipfile.ZipFile(os.path.join(OUT, 'data', 'configurations.zip'), 'w', zipfile.ZIP_DEFLATED) as z:
        for k, v in sorted(files.items()):
            z.writestr('configurations/%s.json' % k, v)

    laws = []
    for gid in ('GEN-bed55eb8', 'GEN-02682632', 'GEN-892745a1', 'GEN-f197ef0e'):
        g = jl(main_files, 'laws/%s.json' % gid)
        fam = g['family']['config']['materials']
        laws.append(dict(matrix=fam['matrix']['model'], fiber=fiber_name(fam['fiber']['params']['E']),
                         curve=rr(g['result']['curve'], 8),
                         rows=[rr(dict(vf=w['vf'], predicted=w['predicted']), 8) for w in g['result']['rows']]))

    nn = json.load(open(os.path.join(PAPER, 'figures/nn/nn_curves.json')))
    nn = {k.replace('fig_nn_dev_', ''): [dict(label=c[0], kind=c[2], fiber=c[3], points=c[1]) for c in v] for k, v in nn.items()}

    site = dict(cases=[summary(x) for x in cases], mesh=[summary(x) for x in mcases], laws=laws, nn=nn)
    json.dump(site, open(os.path.join(OUT, 'data/site.json'), 'w'), separators=(',', ':'))

    order = lambda x: (x['fiber'], x['matrix'], x['rho'], -x['h'])
    comp = [('C11', 0, 0), ('C22', 1, 1), ('C33', 2, 2), ('C12', 0, 1), ('C13', 0, 2), ('C23', 1, 2), ('C44', 3, 3), ('C55', 4, 4), ('C66', 5, 5)]
    write_csv(os.path.join(OUT, 'data/stiffness.csv'),
              ['fiber', 'matrix', 'rho_f'] + [n + ' [MPa]' for n, _, _ in comp] + ['e_TI', 'e_c', 'e_s', '|C13/C12-1|', '|C33/C22-1|', '|C55/C66-1|'],
              [[x['fiber'], x['matrix'], x['rho']] + [x['C'][i][j] for _, i, j in comp]
               + [x['checks'][k] for k in ('e_TI', 'e_c', 'e_s', 'C13_C12', 'C33_C22', 'C55_C66')]
               for x in sorted(cases, key=order)])
    law = {(l['fiber'], l['matrix']): l for l in laws}

    def closed(x, p):
        w = next((w for w in law[(x['fiber'], x['matrix'])]['rows'] if abs(w['vf'] - x['rho']) < 1e-9), None)
        return w['predicted'].get(p) if w else None
    write_csv(os.path.join(OUT, 'data/parameters.csv'),
              ['fiber', 'matrix', 'rho_f'] + ['%s FE [MPa]' % p for p in PARAMS] + ['%s closed form [MPa]' % p for p in PARAMS],
              [[x['fiber'], x['matrix'], x['rho']] + [x['proposed'][p] for p in PARAMS] + [closed(x, p) for p in PARAMS]
               for x in sorted(cases, key=order)])
    write_csv(os.path.join(OUT, 'data/mesh_convergence.csv'),
              ['fiber', 'matrix', 'rho_f', 's/h', 'h', 'C11 [MPa]', 'C22 [MPa]', 'C44 [MPa]', 'gamma [MPa]'],
              [[x['fiber'], x['matrix'], x['rho'], x['s_h'], x['h'], x['C'][0][0], x['C'][1][1], x['C'][3][3], x['C'][1][2] - x['C'][0][1]]
               for x in sorted(mcases, key=order)])

    for t, _ in TESTS:
        p = os.path.join(PAPER, 'figures', 'fig_mises_%s.png' % t)
        if os.path.exists(p):
            shutil.copy(p, os.path.join(OUT, 'img', os.path.basename(p)))
    hexpdf = os.path.join(PAPER, 'figures', 'fig_hexrve.pdf')
    if shutil.which('pdftocairo') and os.path.exists(hexpdf):
        subprocess.run(['pdftocairo', '-png', '-r', '240', '-singlefile', hexpdf, os.path.join(OUT, 'img', 'fig_hexrve')], check=True)
    print('docs/: %d configurations, %d mesh configurations, %d closed-form curves' % (len(cases), len(mcases), len(laws)))


if __name__ == '__main__':
    main()
