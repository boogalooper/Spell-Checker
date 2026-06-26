import re

INPUT_FILES = [
    "names.tsv",
    "surnames.tsv",
    "patronymics.tsv"
]

OUTPUT_FILE = "exceptions_base.txt"


def normalize(word: str) -> str:
    return (
        word.strip()
            .lower()
            .replace("ё", "е")
    )


def load_words(file_path: str):
    words = set()

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()

                if not line:
                    continue

                # TSV: слово \t число
                parts = re.split(r"\t+", line)

                word = parts[0].strip()
                if not word:
                    continue

                words.add(normalize(word))

    except Exception as e:
        print(f"[WARN] Ошибка чтения {file_path}: {e}")

    return words


def main():
    all_words = set()

    for file in INPUT_FILES:
        loaded = load_words(file)
        print(f"[INFO] {file}: {len(loaded)} слов")
        all_words.update(loaded)

    all_words = sorted(all_words)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        for w in all_words:
            f.write(w + "\n")

    print(f"[DONE] Готово: {OUTPUT_FILE}")
    print(f"[INFO] Всего уникальных слов: {len(all_words)}")


if __name__ == "__main__":
    main()