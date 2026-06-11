# Debug script for GSE280402
options(download.file.method="wininet", timeout=300)

if (!requireNamespace("BiocManager", quietly=TRUE))
  install.packages("BiocManager", repos="http://cran.rstudio.com/")
if (!requireNamespace("GEOquery", quietly=TRUE))
  BiocManager::install("GEOquery", ask=FALSE)
library(GEOquery)

geo_id     <- "GSE280402"
output_dir <- "C:/Users/Alivia Hossain/Desktop/deg_debug"
dir.create(output_dir, recursive=TRUE, showWarnings=FALSE)

cat("=== DEBUG GSE280402 ===\n\n")

# Download supplementary files
cat("Downloading files...\n")
tryCatch(getGEOSuppFiles(geo_id, baseDir=output_dir),
         error=function(e) cat("WARN:", conditionMessage(e), "\n"))

# List all files
all_files <- list.files(file.path(output_dir, geo_id),
                        full.names=TRUE, recursive=TRUE)
cat("\nFiles downloaded:\n")
for (f in all_files) cat(" -", basename(f), "\n")

# Preview first file
if (length(all_files) > 0) {
  f <- all_files[1]
  cat("\n--- Previewing:", basename(f), "---\n")
  df <- tryCatch(
    if (grepl("\\.gz$", f))
      read.delim(gzfile(f), header=TRUE, check.names=FALSE, nrows=8)
    else
      read.delim(f, header=TRUE, check.names=FALSE, nrows=8),
    error=function(e){ cat("Read error:", conditionMessage(e), "\n"); NULL }
  )
  if (!is.null(df)) {
    cat("Dimensions: ", nrow(df), "rows x", ncol(df), "cols\n")
    cat("Column names:", paste(head(colnames(df), 5), collapse=" | "), "\n")
    cat("First col values:\n")
    print(head(df[,1], 8))
  }
}

cat("\n=== DONE ===\n")