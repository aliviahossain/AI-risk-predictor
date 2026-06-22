# =============================================================================
# core_deg_engine.R - Universal GEO DEG Pipeline
# Handles: RNA-seq counts, microarray, raw uploaded files
# Usage: Rscript core_deg_engine.R <GEO_ID> <output_dir> [raw_file]
# =============================================================================

args <- commandArgs(trailingOnly=TRUE)
if (length(args) < 2) { cat("Usage: Rscript core_deg_engine.R <GEO_ID> <output_dir> [raw_file]\n"); quit(status=1) }
geo_id     <- toupper(trimws(args[1]))
output_dir <- args[2]
raw_file   <- if (length(args) >= 3) args[3] else NULL

cat("=== DEG PIPELINE STARTED ===\n")
cat("GEO ID    :", geo_id, "\n")
cat("Output dir:", output_dir, "\n")
cat("Raw file  :", if (is.null(raw_file)) "none (will download from GEO)" else raw_file, "\n\n")

# =============================================================================
# 0. Packages
# =============================================================================
options(warn=1, timeout=600)

load_pkg <- function(pkg) {
  if (!requireNamespace(pkg, quietly=TRUE)) {
    cat("  Installing", pkg, "...\n")
    if (!requireNamespace("BiocManager", quietly=TRUE))
      install.packages("BiocManager", repos="http://cran.rstudio.com/", quiet=TRUE)
    BiocManager::install(pkg, ask=FALSE, update=FALSE, quiet=TRUE)
  }
  suppressPackageStartupMessages(library(pkg, character.only=TRUE))
  cat("  [OK]", pkg, "\n")
}
for (p in c("GEOquery","limma","edgeR","pheatmap","Biobase")) load_pkg(p)

# =============================================================================
# 1. Metadata — skip if raw file provided
# =============================================================================
using_raw <- !is.null(raw_file) && file.exists(raw_file)

if (using_raw) {
  cat("\nSTEP 1: Raw file provided — skipping GEO metadata download\n")
  cat("  File:", basename(raw_file), "\n")
  # Create placeholder metadata — will be filled after reading matrix
  gse      <- NULL
  metadata <- NULL
} else {
  cat("\nSTEP 1: Downloading GEO metadata...\n")
  gse_list <- tryCatch(
    getGEO(geo_id, destdir=output_dir, getGPL=FALSE, AnnotGPL=FALSE),
    error=function(e){ cat("ERROR metadata:", conditionMessage(e), "\n"); quit(status=1) }
  )
  gse      <- gse_list[[1]]
  metadata <- pData(gse)
  cat("  Samples :", nrow(metadata), "\n")
  cat("  Platform:", as.character(annotation(gse)), "\n")
}

# =============================================================================
# 2. Get expression files
# =============================================================================
cat("\nSTEP 2: Getting expression files...\n")

if (using_raw) {
  # Use the uploaded file directly
  geo_folder <- output_dir
  dir.create(geo_folder, recursive=TRUE, showWarnings=FALSE)
  dest <- file.path(geo_folder, basename(raw_file))
  if (normalizePath(raw_file) != normalizePath(dest)) {
    file.copy(raw_file, dest, overwrite=TRUE)
  }
  all_files <- dest
  cat("  Using uploaded file:", basename(raw_file), "\n")
} else {
  cat("  Downloading supplementary files...\n")
  tryCatch(
    getGEOSuppFiles(geo_id, baseDir=output_dir),
    error=function(e) cat("  WARN:", conditionMessage(e), "\n")
  )
  geo_folder <- file.path(output_dir, geo_id)
  all_files  <- if (dir.exists(geo_folder))
                  list.files(geo_folder, full.names=TRUE, recursive=TRUE)
                else character(0)
  cat("  Files found:", length(all_files), "\n")
  for (f in all_files) cat("    -", basename(f), "\n")
}

# =============================================================================
# 3. Read expression matrix
# =============================================================================
cat("\nSTEP 3: Reading expression data...\n")
ex_matrix <- NULL
data_type <- "unknown"

find_file <- function(files) {
  EXCL <- c("README","SOFT","soft","family","GPL","md5","\\.pdf$","\\.png$","\\.json$")
  pats <- c(
    "count[s]?\\.(tsv|txt|csv)(\\.gz)?$",
    "count[s]?[._].*\\.(tsv|txt|csv)(\\.gz)?$",
    "raw.*count.*\\.(tsv|txt|csv)(\\.gz)?$",
    "expr.*\\.(tsv|txt|csv)(\\.gz)?$",
    "matrix.*\\.(tsv|txt|csv)(\\.gz)?$",
    "\\.tsv(\\.gz)?$",
    "\\.txt(\\.gz)?$",
    "\\.csv(\\.gz)?$"
  )
  for (pat in pats) {
    hits <- files[grepl(pat, files, ignore.case=TRUE)]
    hits <- hits[!grepl(paste(EXCL, collapse="|"), hits, ignore.case=TRUE)]
    if (length(hits) > 0) return(hits[1])
  }
  NA_character_
}

read_to_matrix <- function(filepath) {
  tryCatch({
    cat("    Reading:", basename(filepath), "\n")
    df <- if (grepl("\\.gz$", filepath))
            read.delim(gzfile(filepath), header=TRUE, check.names=FALSE, comment.char="!")
          else
            read.delim(filepath, header=TRUE, check.names=FALSE, comment.char="!")

    if (is.null(df) || ncol(df) < 2) return(NULL)
    cat("    Raw dims:", nrow(df), "x", ncol(df), "\n")
    cat("    Cols:", paste(head(colnames(df), 6), collapse=" | "), "\n")

    col_names_up <- toupper(colnames(df))

    # Find gene name column — priority: SYMBOL > ENSEMBL > ID > first char col
    SYMBOL_NAMES  <- c("SYMBOL","GENE_SYMBOL","GENE_NAME","HGNC_SYMBOL","GENENAME","GENE","GENESYMBOL")
    ENSEMBL_NAMES <- c("ENSEMBL","ENSEMBL_ID","ENSEMBL_GENE_ID","GENE_ID","TRANSCRIPT_ID")
    ID_NAMES      <- c("ID_REF","PROBEID","PROBE_ID","ID","PROBE","REPORTER")
    ANNOT_NAMES   <- c(SYMBOL_NAMES, ENSEMBL_NAMES, ID_NAMES,
                       "CHROMOSOME","CHR","STRAND","START","END","BIOTYPE",
                       "DESCRIPTION","ENTREZID","NAME")

    sym_col   <- which(col_names_up %in% SYMBOL_NAMES)[1]
    ens_col   <- which(col_names_up %in% ENSEMBL_NAMES)[1]
    id_col    <- which(col_names_up %in% ID_NAMES)[1]
    char_col  <- which(sapply(df, function(x) !is.numeric(x)))[1]

    gene_col  <- if (!is.na(sym_col))  sym_col  else
                 if (!is.na(ens_col))  ens_col  else
                 if (!is.na(id_col))   id_col   else
                 if (!is.na(char_col)) char_col else NA

    cat("    Gene col:", if (!is.na(gene_col)) colnames(df)[gene_col] else "none", "\n")

    rn <- if (!is.na(gene_col)) trimws(as.character(df[, gene_col])) else as.character(seq_len(nrow(df)))

    # Drop all annotation columns, keep only expression
    drop_cols <- unique(c(
      if (!is.na(gene_col)) gene_col else integer(0),
      which(col_names_up %in% ANNOT_NAMES),
      which(sapply(df, function(x) suppressWarnings(any(is.na(as.numeric(as.character(x[!is.na(x)])))))))
    ))
    expr_df <- df[, -drop_cols, drop=FALSE]

    # Keep truly numeric columns
    num_mask <- sapply(expr_df, function(x) {
      v <- suppressWarnings(as.numeric(as.character(x)))
      sum(!is.na(v)) > nrow(expr_df) * 0.5
    })
    expr_df <- expr_df[, num_mask, drop=FALSE]

    if (ncol(expr_df) == 0) { cat("    No numeric columns found\n"); return(NULL) }
    cat("    Expression cols:", ncol(expr_df), "\n")

    mat <- suppressWarnings(data.matrix(expr_df))
    mat[is.na(mat)] <- 0

    # Strip Ensembl version numbers
    rn <- sub("\\.\\d+$", "", rn)

    # Remove empty gene names
    valid <- !is.na(rn) & nchar(trimws(rn)) > 0 & rn != "NA"
    mat   <- mat[valid, , drop=FALSE]
    rn    <- rn[valid]

    # Collapse duplicate gene names
    if (any(duplicated(rn))) {
      uniq <- unique(rn)
      cat("    Collapsing", length(rn), "->", length(uniq), "genes\n")
      rn_factor <- factor(rn, levels=uniq)
      mat_col   <- rowsum(mat, rn_factor)
      mat <- mat_col
    } else {
      rownames(mat) <- make.unique(rn)
    }

    cat("    Final:", nrow(mat), "genes x", ncol(mat), "samples\n")
    mat
  }, error=function(e){ cat("    read error:", conditionMessage(e), "\n"); NULL })
}

# Try supplementary/uploaded file
sf <- find_file(all_files)
if (!is.na(sf)) {
  cat("  [A] File:", basename(sf), "\n")
  mat <- read_to_matrix(sf)
  if (!is.null(mat) && nrow(mat) > 50 && ncol(mat) >= 2) {
    ex_matrix <- mat
    is_int    <- all(mat == floor(mat), na.rm=TRUE)
    max_val   <- max(mat[is.finite(mat)])
    med_val   <- median(mat[mat > 0 & is.finite(mat)], na.rm=TRUE)
    data_type <- if (is_int && max_val > 50 && med_val > 5) "counts" else "microarray"
    cat("  Type:", data_type, "\n")
  }
}

# Fallback: exprs() from series matrix (only if not raw upload)
if (is.null(ex_matrix) && !using_raw && !is.null(gse)) {
  cat("  [B] Using exprs() from series matrix\n")
  mat <- tryCatch(exprs(gse), error=function(e) NULL)
  if (!is.null(mat) && nrow(mat) > 50 && ncol(mat) >= 2) {
    mat[is.na(mat)] <- 0
    ex_matrix <- mat
    data_type  <- "microarray"
    cat("  Dimensions:", nrow(mat), "x", ncol(mat), "\n")
  }
}

if (is.null(ex_matrix)) {
  cat("ERROR: Could not load expression data\n")
  quit(status=1)
}

# =============================================================================
# 4. Clean matrix
# =============================================================================
cat("\nSTEP 4: Cleaning matrix...\n")
cat("  Before:", nrow(ex_matrix), "x", ncol(ex_matrix), "\n")

num_ok    <- apply(ex_matrix, 2, function(x) is.numeric(x) && sum(!is.na(x)) > 0)
ex_matrix <- ex_matrix[, num_ok, drop=FALSE]
cs        <- colSums(ex_matrix, na.rm=TRUE)
ex_matrix <- ex_matrix[, cs > 0, drop=FALSE]
rs        <- rowSums(ex_matrix, na.rm=TRUE)
rv        <- apply(ex_matrix, 1, var, na.rm=TRUE)
ex_matrix <- ex_matrix[rs > 0 & !is.na(rv) & rv > 0, , drop=FALSE]

n_samples <- ncol(ex_matrix)
cat("  After:", nrow(ex_matrix), "x", n_samples, "\n")

if (n_samples < 4) {
  cat("ERROR: Only", n_samples, "valid samples. Need >= 4.\n")
  quit(status=1)
}

# =============================================================================
# 5. Group assignment
# =============================================================================
cat("\nSTEP 5: Assigning groups...\n")

# Build metadata if raw upload (no GEO metadata available)
if (using_raw || is.null(metadata)) {
  cat("  Building metadata from column names\n")
  cn <- tolower(colnames(ex_matrix))
  metadata <- data.frame(
    title               = colnames(ex_matrix),
    characteristics_ch1 = colnames(ex_matrix),
    source_name_ch1     = colnames(ex_matrix),
    stringsAsFactors    = FALSE
  )
}

# Safe metadata alignment
n_meta         <- nrow(metadata)
idx            <- seq_len(n_samples)
idx[idx > n_meta] <- ((idx[idx > n_meta] - 1) %% n_meta) + 1
metadata_final <- metadata[idx, , drop=FALSE]
rownames(metadata_final) <- colnames(ex_matrix)

get_col_safe <- function(df, col) {
  if (col %in% colnames(df)) tolower(trimws(as.character(df[[col]])))
  else rep("", nrow(df))
}

titles   <- get_col_safe(metadata_final, "title")
chars    <- get_col_safe(metadata_final, "characteristics_ch1")
source   <- get_col_safe(metadata_final, "source_name_ch1")
combined <- paste(titles, chars, source)

CASE <- "t2d|type.2|diabetic|diabetes|tumor|cancer|carcinoma|adenocarcinoma|case|patient|disease"
CTRL <- "control|normal|healthy|non.diabetic|non.tumor|adjacent|benign|uninfected|wt"

group <- rep("Case", n_samples)
group[grepl(CTRL, combined, ignore.case=TRUE)] <- "Control"

if (sum(group=="Case")==0 || sum(group=="Control")==0) {
  group <- ifelse(grepl(CASE, combined, ignore.case=TRUE), "Case", "Control")
}
if (sum(group=="Case")==0 || sum(group=="Control")==0) {
  cn    <- tolower(colnames(ex_matrix))
  group <- ifelse(grepl("t2d|case|tumor|cancer|disease|patient", cn), "Case", "Control")
}
if (sum(group=="Case")==0 || sum(group=="Control")==0) {
  cat("  WARN: splitting 50/50\n")
  half  <- floor(n_samples/2)
  group <- c(rep("Control", half), rep("Case", n_samples-half))
}

group <- factor(group, levels=c("Control","Case"))
cat("  Case:", sum(group=="Case"), "| Control:", sum(group=="Control"), "\n")

# =============================================================================
# 6. DGE analysis
# =============================================================================
cat("\nSTEP 6: DGE analysis (", data_type, ")...\n")
design <- model.matrix(~group)
v      <- NULL

fit <- tryCatch({
  if (data_type == "counts") {
    keep    <- filterByExpr(ex_matrix, group)
    ex_filt <- ex_matrix[keep, , drop=FALSE]
    cat("  Genes after filter:", nrow(ex_filt), "\n")
    dge     <- DGEList(counts=ex_filt)
    dge     <- calcNormFactors(dge)
    png(file.path(output_dir,"voom_plot.png"), width=800, height=500)
    v <<- voom(dge, design, plot=TRUE)
    dev.off()
    lmFit(v, design)
  } else {
    if (max(ex_matrix, na.rm=TRUE) > 100) {
      cat("  Log2 transforming\n")
      ex_matrix <<- log2(ex_matrix + 1)
    }
    lmFit(ex_matrix, design)
  }
}, error=function(e){
  cat("  WARN primary fit:", conditionMessage(e), "- using log2 fallback\n")
  tryCatch(
    lmFit(log2(abs(ex_matrix)+1), design),
    error=function(e2){ cat("ERROR lmFit:", conditionMessage(e2),"\n"); quit(status=1) }
  )
})

fit2 <- tryCatch(eBayes(fit),
                 error=function(e){ cat("ERROR eBayes:", conditionMessage(e),"\n"); quit(status=1) })

# =============================================================================
# 7. Results
# =============================================================================
cat("\nSTEP 7: Building results table...\n")
results <- tryCatch(
  topTable(fit2, coef=2, number=Inf, adjust.method="BH", sort.by="P"),
  error=function(e){ cat("ERROR topTable:", conditionMessage(e),"\n"); quit(status=1) }
)

if (!"GeneSymbol" %in% colnames(results)) results$GeneSymbol <- rownames(results)
results$GeneSymbol <- trimws(as.character(results$GeneSymbol))
results <- results[!is.na(results$GeneSymbol) &
                   results$GeneSymbol != "" &
                   results$GeneSymbol != "NA", , drop=FALSE]

for (col in c("logFC","AveExpr","t","P.Value","adj.P.Val","B")) {
  if (!col %in% colnames(results)) results[[col]] <- 0
}

cat("  Total genes:", nrow(results), "\n")

full_csv <- file.path(output_dir, paste0(geo_id,"_DEGs_Full.csv"))
write.csv(
  results[, c("GeneSymbol","logFC","AveExpr","t","P.Value","adj.P.Val","B")],
  full_csv, row.names=FALSE
)
write.csv(
  subset(results, P.Value < 0.001)[, c("GeneSymbol","logFC","AveExpr","t","P.Value","adj.P.Val","B")],
  file.path(output_dir, paste0(geo_id,"_DEGs_Strict.csv")),
  row.names=FALSE
)
cat("  Saved:", basename(full_csv), "\n")

# =============================================================================
# 8. Heatmap
# =============================================================================
cat("\nSTEP 8: Heatmap...\n")
heatmap_file <- ""
tryCatch({
  top_n    <- min(28, nrow(results))
  top_syms <- head(results$GeneSymbol, top_n)
  src_mat  <- if (!is.null(v) && !is.null(v$E)) v$E else ex_matrix
  shared   <- intersect(top_syms, rownames(src_mat))
  if (length(shared) < 2) stop("Too few genes for heatmap")
  plot_mat <- src_mat[shared, , drop=FALSE]
  anno     <- data.frame(Group=group, row.names=colnames(plot_mat))
  heatmap_file <- file.path(output_dir, paste0(geo_id,"_Top28_Heatmap.png"))
  png(heatmap_file, width=10, height=12, units="in", res=120)
  pheatmap(plot_mat, scale="row", annotation_col=anno,
           main=paste0(geo_id,": Top ",length(shared)," DEGs"),
           show_colnames=FALSE, fontsize_row=7,
           color=colorRampPalette(c("blue","white","red"))(100))
  dev.off()
  cat("  Heatmap saved\n")
}, error=function(e) cat("  WARN heatmap skipped:", conditionMessage(e),"\n"))

# =============================================================================
# 9. Summary JSON
# =============================================================================
cat("\nSTEP 9: Writing summary...\n")
n_up <- sum(results$logFC > 0 & results$adj.P.Val < 0.05, na.rm=TRUE)
n_dn <- sum(results$logFC < 0 & results$adj.P.Val < 0.05, na.rm=TRUE)

writeLines(paste0(
  '{"geo_id":"',        geo_id,               '",',
  '"total_genes":',     nrow(results),         ',',
  '"upregulated":',     n_up,                  ',',
  '"downregulated":',   n_dn,                  ',',
  '"samples":',         n_samples,             ',',
  '"case_samples":',    sum(group=="Case"),     ',',
  '"control_samples":', sum(group=="Control"),  ',',
  '"data_type":"',      data_type,             '",',
  '"full_csv":"',       basename(full_csv),    '",',
  '"heatmap":"',        basename(heatmap_file),'"}'
), file.path(output_dir,"pipeline_summary.json"))

cat("\n=== PIPELINE COMPLETE ===\n")
cat("Total:", nrow(results), "| Up:", n_up, "| Down:", n_dn, "\n")