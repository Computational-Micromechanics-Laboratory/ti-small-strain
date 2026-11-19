# Areal confinement data

Supplementary data page of the paper "A small-strain areal-confinement formulation for transversely isotropic
solids" (Yildirim, Karaahmet, Alperen, Dal): the finite element results of Section 5 and Appendix B, the
identified parameters and their closed-form and hybrid predictions.

Page: https://computational-micromechanics-laboratory.github.io/ti-small-strain/

* `src/`: the page (HTML, CSS, JavaScript, no dependencies).
* `build.py`: writes `docs/` (the published page and its data files) from the paper's data. Standard library only;
  `pdftocairo` (poppler) converts the cell figure.
* `docs/`: published by GitHub Pages. Rebuild with `python build.py PATH_TO_PAPER_REPOSITORY`, commit and push.

Preview locally: `python -m http.server 8781 --directory docs`, then open http://localhost:8781.
