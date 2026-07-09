# Core Environment Bootstrap Audit

The current core environments resolve directly through the declared conda
channels. This table records the retained package set, install route, official
package source, and operational note for each package or tight package group.

| environment | package | preferred_install_method | verified_source | note |
| --- | --- | --- | --- | --- |
| `sc-py-singlecell` | `python=3.11` | `conda-forge` | [Python 3.11 documentation](https://docs.python.org/3.11/) | runtime baseline |
| `sc-py-singlecell` | `pip` | `conda-forge` | [pip documentation](https://pip.pypa.io/en/stable/) | package installer |
| `sc-py-singlecell` | `numpy`, `pandas`, `scipy`, `scikit-learn` | `conda-forge` | [NumPy docs](https://numpy.org/doc/stable/); [pandas docs](https://pandas.pydata.org/docs/); [SciPy docs](https://docs.scipy.org/doc/scipy/); [scikit-learn docs](https://scikit-learn.org/stable/) | scientific Python base |
| `sc-py-singlecell` | `anndata` | `conda-forge` | [AnnData docs](https://anndata.readthedocs.io/en/stable/) | annotated matrix container |
| `sc-py-singlecell` | `scanpy` | `conda-forge` | [Scanpy docs](https://scanpy.readthedocs.io/en/stable/) | single-cell analysis API |
| `sc-py-singlecell` | `h5py` | `conda-forge` | [h5py docs](https://docs.h5py.org/en/stable/) | HDF5 IO support |
| `sc-py-singlecell` | `umap-learn`, `pynndescent` | `conda-forge` | [UMAP docs](https://umap-learn.readthedocs.io/en/latest/); [PyNNDescent docs](https://pynndescent.readthedocs.io/en/latest/) | neighborhood graph backend |
| `sc-py-singlecell` | `python-igraph`, `leidenalg` | `conda-forge` | [python-igraph docs](https://python.igraph.org/en/stable/); [leidenalg docs](https://leidenalg.readthedocs.io/en/latest/) | graph and clustering backend |
| `sc-py-singlecell` | `matplotlib-base` | `conda-forge` | [Matplotlib docs](https://matplotlib.org/stable/) | base plotting dependency for Scanpy outputs |
| `sc-r-singlecell` | `r-base` | `conda-forge` | [R project](https://cran.r-project.org/) | R runtime baseline |
| `sc-r-singlecell` | `r-seurat`, `r-seuratobject` | `conda-forge` | [Seurat docs](https://satijalab.org/seurat/); [SeuratObject docs](https://satijalab.github.io/seurat-object/) | Seurat v5 object and analysis core |
| `sc-r-singlecell` | `r-sctransform` | `conda-forge` | [sctransform repository](https://github.com/satijalab/sctransform) | variance-stabilizing normalization |
| `sc-r-singlecell` | `r-future`, `r-future.apply` | `conda-forge` | [future docs](https://future.futureverse.org/); [future.apply docs](https://future.apply.futureverse.org/) | parallel execution support |
| `sc-r-singlecell` | `r-data.table` | `conda-forge` | [data.table site](https://r-datatable.com/) | high-volume tabular operations |
| `sc-r-singlecell` | `r-dplyr`, `r-tidyr`, `r-tibble`, `r-readr`, `r-stringr` | `conda-forge` | [dplyr docs](https://dplyr.tidyverse.org/); [tidyr docs](https://tidyr.tidyverse.org/); [tibble docs](https://tibble.tidyverse.org/); [readr docs](https://readr.tidyverse.org/); [stringr docs](https://stringr.tidyverse.org/) | tidy data manipulation and IO |
| `sc-r-singlecell` | `bioconductor-singlecellexperiment`, `bioconductor-summarizedexperiment` | `bioconda` | [SingleCellExperiment](https://bioconductor.org/packages/SingleCellExperiment/); [SummarizedExperiment](https://bioconductor.org/packages/SummarizedExperiment/) | Bioconductor object backbone |
| `sc-r-singlecell` | `bioconductor-scater`, `bioconductor-scran`, `bioconductor-scuttle` | `bioconda` | [scater](https://bioconductor.org/packages/scater/); [scran](https://bioconductor.org/packages/scran/); [scuttle](https://bioconductor.org/packages/scuttle/) | QC and preprocessing utilities |
| `sc-r-singlecell` | `bioconductor-dropletutils` | `bioconda` | [DropletUtils](https://bioconductor.org/packages/DropletUtils/) | droplet barcode processing |
| `sc-r-singlecell` | `bioconductor-zellkonverter` | `bioconda` | [zellkonverter](https://bioconductor.org/packages/zellkonverter/) | AnnData and SCE handoff |
| `sc-r-singlecell` | `bioconductor-singler`, `bioconductor-celldex` | `bioconda` | [SingleR](https://bioconductor.org/packages/SingleR/); [celldex](https://bioconductor.org/packages/celldex/) | reference-based cell annotation |
| `sc-r-singlecell` | `bioconductor-glmgampoi` | `bioconda` | [glmGamPoi](https://bioconductor.org/packages/glmGamPoi/) | gamma-Poisson fitting support |
| `sc-r-singlecell` | `bioconductor-biomart` | `bioconda` | [biomaRt](https://bioconductor.org/packages/biomaRt/) | Ensembl annotation queries |
| `sc-r-singlecell` | `bioconductor-annotationhub` | `bioconda` | [AnnotationHub](https://bioconductor.org/packages/AnnotationHub/) | indexed annotation resource access |
| `sc-r-singlecell` | `bioconductor-go.db`, `bioconductor-org.hs.eg.db`, `bioconductor-org.mm.eg.db` | `bioconda` | [GO.db](https://bioconductor.org/packages/GO.db/); [org.Hs.eg.db](https://bioconductor.org/packages/org.Hs.eg.db/); [org.Mm.eg.db](https://bioconductor.org/packages/org.Mm.eg.db/) | GO, human, and mouse annotation maps |
| `sc-r-singlecell` | `r-yaml`, `r-jsonlite`, `r-optparse` | `conda-forge` | [yaml CRAN page](https://cran.r-project.org/package=yaml); [jsonlite CRAN page](https://cran.r-project.org/package=jsonlite); [optparse CRAN page](https://cran.r-project.org/package=optparse) | configuration and CLI helpers |
| `sc-r-plot` | `r-base` | `conda-forge` | [R project](https://cran.r-project.org/) | R runtime baseline |
| `sc-r-plot` | `r-ggplot2`, `r-patchwork`, `r-cowplot`, `r-gridextra` | `conda-forge` | [ggplot2 docs](https://ggplot2.tidyverse.org/); [patchwork docs](https://patchwork.data-imaginist.com/); [cowplot docs](https://wilkelab.org/cowplot/); [gridExtra site](https://cindyfang70.github.io/gridExtra/) | figure assembly and panel layout |
| `sc-r-plot` | `r-ggpubr`, `r-ggrepel`, `r-ggsignif`, `r-rstatix` | `conda-forge` | [ggpubr docs](https://rpkgs.datanovia.com/ggpubr/); [ggrepel docs](https://ggrepel.slowkow.com/); [ggsignif docs](https://const-ae.github.io/ggsignif/); [rstatix docs](https://rpkgs.datanovia.com/rstatix/) | statistical layers and labels |
| `sc-r-plot` | `r-ggbeeswarm`, `r-ggdist`, `r-ggridges`, `r-ggalluvial`, `r-ggforce`, `r-ggtext`, `r-aplot` | `conda-forge` | [ggbeeswarm CRAN page](https://cran.r-project.org/package=ggbeeswarm); [ggdist docs](https://mjskay.github.io/ggdist/); [ggridges docs](https://wilkelab.org/ggridges/); [ggalluvial docs](https://corybrunson.github.io/ggalluvial/); [ggforce docs](https://ggforce.data-imaginist.com/); [ggtext docs](https://wilkelab.org/ggtext/); [aplot docs](https://yulab-smu.top/aplot/) | distribution, text, and layout extensions |
| `sc-r-plot` | `bioconductor-complexheatmap` | `bioconda` | [ComplexHeatmap](https://bioconductor.org/packages/ComplexHeatmap/) | heatmap engine |
| `sc-r-plot` | `r-circlize`, `r-pheatmap` | `conda-forge` | [circlize docs](https://jokergoo.github.io/circlize_book/book/); [pheatmap CRAN page](https://cran.r-project.org/package=pheatmap) | circular annotation and heatmap helpers |
| `sc-r-plot` | `bioconductor-enhancedvolcano`, `bioconductor-dittoseq` | `bioconda` | [EnhancedVolcano](https://bioconductor.org/packages/EnhancedVolcano/); [dittoSeq](https://bioconductor.org/packages/dittoSeq/) | expression and marker visualization helpers |
| `sc-r-plot` | `r-ggsci`, `r-rcolorbrewer`, `r-viridis`, `r-colorspace`, `r-scales` | `conda-forge` | [ggsci site](https://nanx.me/ggsci/); [RColorBrewer CRAN page](https://cran.r-project.org/package=RColorBrewer); [viridis site](https://sjmgarnier.github.io/viridis/); [colorspace site](https://colorspace.r-forge.r-project.org/); [scales docs](https://scales.r-lib.org/) | palette and scale management |
| `sc-r-plot` | `r-svglite`, `r-ragg`, `r-cairo` | `conda-forge` | [svglite docs](https://svglite.r-lib.org/); [ragg docs](https://ragg.r-lib.org/); [Cairo CRAN page](https://cran.r-project.org/package=Cairo) | vector and raster render devices |
