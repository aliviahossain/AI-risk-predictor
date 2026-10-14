find_expression_file <- function(files) {
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
