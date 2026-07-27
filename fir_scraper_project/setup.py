from setuptools import setup, find_packages

setup(
    name="fir-scraper",
    version="0.1.0",
    description="Scan FIR numbers and download matching PDFs",
    py_modules=["fir_scraper"],
    install_requires=[
        "requests>=2.31.0",
        "urllib3>=2.2.0",
        "beautifulsoup4>=4.12.0",
        "python-dotenv>=1.0.0",
        "Flask>=3.0.0",
        "pypdf>=4.0.0",
        "pytesseract>=0.3.10,<0.4",
        "Pillow>=10.0.0",
        "pdf2image>=1.17.0",
    ],
    entry_points={
        "console_scripts": [
            "fir-scrape=fir_scraper:main",
        ],
    },
)
