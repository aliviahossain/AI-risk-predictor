test_file <- grep(
  "^--file=",
  commandArgs(trailingOnly=FALSE),
  value=TRUE
)
if (length(test_file) != 1) stop("Could not determine the test script path")

test_dir <- dirname(normalizePath(sub("^--file=", "", test_file)))
source(file.path(test_dir, "..", "analysis", "pipeline_utils.R"))

supplementary_files <- c(
  "GSE280402_TPM.tsv.gz",
  "GSE280402_counts.tsv.gz",
  "GSE280402_README.txt"
)
selected <- find_expression_file(supplementary_files)
stopifnot(identical(selected, "GSE280402_counts.tsv.gz"))
stopifnot(identical(
  supplementary_files[grepl(glob2rx(selected), supplementary_files)],
  selected
))
stopifnot(identical(
  find_expression_file(c("README.txt", "GSE1_series_matrix.txt.gz")),
  "GSE1_series_matrix.txt.gz"
))
stopifnot(is.na(find_expression_file(c("README.txt", "GPL1_annotation.txt"))))

cat("GEO supplementary-file selection tests passed\n")
