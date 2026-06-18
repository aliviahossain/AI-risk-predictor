# =============================================================================
# core_deg_engine.R — Universal GEO DEG Pipeline
# Handles: RNA-seq counts, microarray (Affy/Illumina/Agilent), series matrix,
#          AND now: a raw user-uploaded expression file (no GEO download).
#
# Usage:
#   Rscript core_deg_engine.R <GEO_ID> <output_dir>
#   Rscript core_deg_engine.R <GEO_ID> <output_dir> <raw_file_path>
#
# When <raw_file_path> is supplied, STEP 1/2 (GEO metadata + supplementary file
# download) are skipped entirely — the uploaded file is read directly and used
# as the expression matrix. geo_id in this mode is just a label for filenames.
# =============================================================================

args <- commandArgs(trailingOnly=TRUE)
set.seed(42)
if (length(args) < 2) {
  cat("Usage: Rscript core_deg_engine.R <GEO_ID> <output_dir> [raw_file_path]\n")
  quit(status=1)
}
geo_id      <- toupper(trimws(args[1]))
output_dir  <- args[2]
raw_file    <- if (length(args) >= 3 && nzchar(args[3])) args[3] else NA_character_
upload_mode <- !is.na(raw_file)

cat("=== DEG PIPELINE STARTED ===\n")
cat("GEO ID    :", geo_id, "\n")
cat("Output dir:", output_dir, "\n")
if (upload_mode) cat("Mode      : raw file upload (", raw_file, ")\n", sep="")
cat("\n")

# =============================================================================
# 0. Packages
# =============================================================================
options(download.file.method="wininet", warn=1, timeout=300)

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
# GEOquery/Biobase only strictly needed when we're actually contacting GEO.
pkgs_needed <- if (upload_mode) c("limma","edgeR","pheatmap") else c("GEOquery","limma","edgeR","pheatmap","Biobase")
for (p in pkgs_needed) load_pkg(p)

# =============================================================================
# 1. Metadata
# =============================================================================
metadata <- NULL
gse      <- NULL

if (!upload_mode) {
  cat("STEP 1: Downloading GEO metadata...\n")
  gse_list <- tryCatch(
    getGEO(geo_id, destdir=output_dir, getGPL=FALSE, AnnotGPL=FALSE),
    error=function(e){ cat("ERROR metadata:", conditionMessage(e),"\n"); quit(status=1) }
  )
  gse      <- gse_list[[1]]
  metadata <- pData(gse)
  cat("  Samples :", nrow(metadata), "\n")
  cat("  Platform:", as.character(annotation(gse)), "\n")
} else {
  cat("STEP 1: Skipped (raw file upload mode — no GEO metadata lookup)\n")
}

# =============================================================================
# 2. Download supplementary files
# =============================================================================
all_files <- character(0)

if (!upload_mode) {
  cat("\nSTEP 2: Downloading supplementary files...\n")
  tryCatch(getGEOSuppFiles(geo_id, baseDir=output_dir),
           error=function(e) cat("  WARN:", conditionMessage(e), "\n"))

  geo_folder <- file.path(output_dir, geo_id)
  all_files  <- if (dir.exists(geo_folder)) {
                  list.files(geo_folder, full.names=TRUE, recursive=TRUE)
                } else {
                  character(0)
                }

  cat("  Files found:", length(all_files), "\n")
  for (f in all_files) cat("    •", basename(f), "\n")
} else {
  cat("\nSTEP 2: Skipped (using uploaded file directly)\n")
  if (!file.exists(raw_file)) {
    cat("ERROR: Uploaded file not found at", raw_file, "\n")
    quit(status=1)
  }
  all_files <- raw_file
}

# =============================================================================
# 3. Read expression matrix
# =============================================================================
cat("\nSTEP 3: Reading expression data...\n")
ex_matrix <- NULL
data_type <- "unknown"

# Helper: find best file from list
find_file <- function(files) {
  EXCL <- c("README","SOFT","soft","family","GPL","md5","\\.pdf$","\\.png$")
  pats <- c("count[s]?\\.(tsv|txt|csv)(\\.gz)?$",
            "count[s]?[._].*\\.(tsv|txt|csv)(\\.gz)?$",
            "raw.*count.*\\.(tsv|txt|csv)(\\.gz)?$",
            "expr.*\\.(tsv|txt|csv)(\\.gz)?$",
            "matrix.*\\.(tsv|txt|csv)(\\.gz)?$",
            "\\.tsv(\\.gz)?$",
            "\\.txt(\\.gz)?$",
            "\\.csv(\\.gz)?$")
  for (pat in pats) {
    hits <- files[grepl(pat, files, ignore.case=TRUE)]
    hits <- hits[!grepl(paste(EXCL, collapse="|"), hits, ignore.case=TRUE)]
    if (length(hits) > 0) return(hits[1])
  }
  NA_character_
}

# Helper: safe read to matrix
read_to_matrix <- function(filepath) {
  tryCatch({
    df <- if (grepl("\\.gz$", filepath))
            read.delim(gzfile(filepath), header=TRUE, check.names=FALSE, comment.char="!")
          else
            read.delim(filepath, header=TRUE, check.names=FALSE, comment.char="!")

    if (ncol(df) < 2) return(NULL)

    if (!is.numeric(df[,1])) {
      rn <- make.unique(trimws(as.character(df[,1])))
      df <- df[,-1, drop=FALSE]
    } else {
      rn <- as.character(seq_len(nrow(df)))
    }

    num_mask <- sapply(df, function(x) {
      suppressWarnings(!all(is.na(as.numeric(as.character(x)))))
    })
    df <- df[, num_mask, drop=FALSE]
    if (ncol(df) == 0) return(NULL)

    mat <- suppressWarnings(data.matrix(df))
    rownames(mat) <- rn
    mat[is.na(mat)] <- 0
    mat
  }, error=function(e){ cat("    read error:", conditionMessage(e), "\n"); NULL })
}

# Helper: detect data_type from a numeric matrix (shared between upload + supp paths)
detect_data_type <- function(mat) {
  is_int  <- all(mat == floor(mat), na.rm=TRUE)
  max_val <- max(mat[is.finite(mat)])
  med_val <- median(mat[mat > 0 & is.finite(mat)], na.rm=TRUE)
  list(type = if (is_int && max_val > 50 && med_val > 5) "counts" else "microarray",
       max_val = max_val, med_val = med_val)
}

if (upload_mode) {
  # ── Raw upload path: read the user's file directly, no GEO fallback ──────
  cat("  [Upload] Reading uploaded file:", basename(raw_file), "\n")
  mat <- read_to_matrix(raw_file)
  if (is.null(mat) || nrow(mat) < 10 || ncol(mat) < 2) {
    cat("ERROR: Uploaded file could not be parsed into a valid expression matrix ",
        "(need >=10 genes and >=2 samples). Check formatting.\n", sep="")
    quit(status=1)
  }
  ex_matrix <- mat
  det <- detect_data_type(mat)
  data_type <- det$type
  cat("  Type:", data_type, "(max=", round(det$max_val,1), ", med=", round(det$med_val,2), ")\n")
  cat("  Dimensions:", nrow(ex_matrix), "x", ncol(ex_matrix), "\n")

} else {
  # ── GEO ID path (unchanged): supplementary file, then exprs() fallback ───
  sf <- find_file(all_files)
  if (!is.na(sf)) {
    cat("  [A] Supplementary file:", basename(sf), "\n")
    mat <- read_to_matrix(sf)
    if (!is.null(mat) && nrow(mat) > 50 && ncol(mat) >= 2) {
      ex_matrix <- mat
      det <- detect_data_type(mat)
      data_type <- det$type
      cat("  Type:", data_type, "(max=", round(det$max_val,1), ", med=", round(det$med_val,2), ")\n")
    }
  }

  if (is.null(ex_matrix)) {
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
    cat("ERROR: No expression data found for", geo_id, "\n")
    quit(status=1)
  }
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
cat("  After :", nrow(ex_matrix), "x", n_samples, "\n")

if (n_samples < 4) {
  cat("ERROR: Only", n_samples, "valid samples. Need >= 4.\n")
  quit(status=1)
}

# Metadata alignment — only meaningful when we actually have GEO metadata.
if (!upload_mode) {
  n_meta            <- nrow(metadata)
  idx                <- seq_len(n_samples)
  idx[idx > n_meta]  <- ((idx[idx > n_meta] - 1) %% n_meta) + 1
  metadata_final     <- metadata[idx, , drop=FALSE]
  rownames(metadata_final) <- colnames(ex_matrix)
} else {
  # No GEO metadata in upload mode — build a stub frame so downstream group
  # detection (which reads title/characteristics/source columns) degrades
  # gracefully to its column-name / 50-50 fallback logic.
  metadata_final <- data.frame(
    title = colnames(ex_matrix),
    row.names = colnames(ex_matrix),
    stringsAsFactors = FALSE
  )
}

# =============================================================================
# 5. Group assignment
# =============================================================================
cat("\nSTEP 5: Assigning groups...\n")

get_col_safe <- function(df, col) {
  if (col %in% colnames(df)) tolower(trimws(as.character(df[[col]])))
  else rep("", nrow(df))
}

titles   <- get_col_safe(metadata_final, "title")
chars    <- get_col_safe(metadata_final, "characteristics_ch1")
source   <- get_col_safe(metadata_final, "source_name_ch1")
combined <- paste(titles, chars, source)

CASE <- "t2d|type.2|diabetic|diabetes|tumor|cancer|carcinoma|adenocarcinoma|case|patient|disease|infected"
CTRL <- "control|normal|healthy|non.diabetic|non.tumor|adjacent|benign|uninfected|wild.type|wt"

group <- rep("Case", n_samples)
group[grepl(CTRL, combined, ignore.case=TRUE)] <- "Control"

if (sum(group=="Case") == 0 || sum(group=="Control") == 0) {
  group <- ifelse(grepl(CASE, combined, ignore.case=TRUE), "Case", "Control")
}

# Column name fallback — this is the PRIMARY signal in upload mode, since
# uploaded files have no GEO characteristics fields, only column headers.
if (sum(group=="Case") == 0 || sum(group=="Control") == 0) {
  cn <- tolower(colnames(ex_matrix))
  group <- ifelse(grepl(CTRL, cn), "Control",
            ifelse(grepl("t2d|case|tumor|cancer|disease|patient", cn), "Case", NA))
  # If column names gave a partial/ambiguous read, treat unmatched as Case by default
  group[is.na(group)] <- "Case"
}

if (sum(group=="Case") == 0 || sum(group=="Control") == 0) {
  cat("  WARN: could not auto-detect groups from metadata or column names — splitting 50/50\n")
  half  <- floor(n_samples / 2)
  group <- c(rep("Control", half), rep("Case", n_samples - half))
}

group <- factor(group, levels=c("Control","Case"))
cat("  Case:", sum(group=="Case"), "| Control:", sum(group=="Control"), "\n")
if (upload_mode) {
  cat("  NOTE: raw upload mode has no GEO sample metadata — groups were inferred from\n")
  cat("        column header text. Please verify the heatmap/group annotation looks correct.\n")
}

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
  cat("  WARN primary fit:", conditionMessage(e), "— using log2 fallback\n")
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
write.csv(results[, c("GeneSymbol","logFC","AveExpr","t","P.Value","adj.P.Val","B")],
          full_csv, row.names=FALSE)

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
  if (length(shared) < 2) stop("Too few matching gene IDs for heatmap")

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
n_up <- sum(results$logFC > 0 & results$P.Value < 0.05, na.rm=TRUE)
n_dn <- sum(results$logFC < 0 & results$P.Value < 0.05, na.rm=TRUE)

writeLines(paste0(
  '{"geo_id":"',         geo_id,                   '",',
  '"total_genes":',      nrow(results),             ',',
  '"upregulated":',      n_up,                      ',',
  '"downregulated":',    n_dn,                      ',',
  '"samples":',          n_samples,                 ',',
  '"case_samples":',     sum(group=="Case"),         ',',
  '"control_samples":', sum(group=="Control"),       ',',
  '"data_type":"',       data_type,                 '",',
  '"upload_mode":',      tolower(as.character(upload_mode)), ',',
  '"full_csv":"',        basename(full_csv),         '",',
  '"heatmap":"',         basename(heatmap_file),     '"}'
), file.path(output_dir,"pipeline_summary.json"))

cat("\n=== PIPELINE COMPLETE ===\n")
cat("Total:", nrow(results), "| Up:", n_up, "| Down:", n_dn, "\n")