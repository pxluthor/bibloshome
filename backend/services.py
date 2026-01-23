import os
import pdfplumber
from deep_translator import GoogleTranslator
from fastapi import HTTPException

class PDFService:
    def __init__(self, source_dir: str):
        self.source_dir = source_dir

    def get_file_path(self, filename: str) -> str:
        print(f"DEBUG: Resolving path for filename: {filename}")
        # Check if the filename is actually an absolute path and exists
        if os.path.isabs(filename) and os.path.exists(filename):
            print(f"DEBUG: Found absolute path: {filename}")
            return filename
            
        # Fallback to source_dir if it's just a filename or relative path
        file_path = os.path.join(self.source_dir, filename)
        print(f"DEBUG: Checking constructed path: {file_path}")
        
        if not os.path.exists(file_path):
            print(f"DEBUG: File not found at: {file_path}")
            # Try to handle cases where the DB path might be from a different OS or mount
            # For now, we just raise 404
            raise HTTPException(status_code=404, detail=f"PDF file not found: {filename}")
        
        print(f"DEBUG: File found at: {file_path}")
        return file_path

    def extract_text(self, file_path: str, page_number: int) -> str:
        """
        Extracts text from a specific page number (1-indexed).
        """
        try:
            with pdfplumber.open(file_path) as pdf:
                # pdfplumber pages are 0-indexed
                if page_number < 1 or page_number > len(pdf.pages):
                    raise HTTPException(status_code=404, detail="Page number out of range")
                
                page = pdf.pages[page_number - 1]
                text = page.extract_text()
                return text or ""
        except Exception as e:
            print(f"Error reading PDF: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")

    def count_pages(self, file_path: str) -> int:
        """
        Returns the total number of pages in the PDF.
        """
        try:
            with pdfplumber.open(file_path) as pdf:
                return len(pdf.pages)
        except Exception as e:
            print(f"Error counting PDF pages: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to count PDF pages: {str(e)}")

class TranslationService:
    def __init__(self):
        self.translator = GoogleTranslator(source='auto', target='pt')

    def translate(self, text: str) -> str:
        if not text or not text.strip():
            return ""
        try:
            # deep-translator handles text splitting internally usually, but for very large texts 
            # we might need to be careful. For single pages it should be fine.
            return self.translator.translate(text)
        except Exception as e:
            print(f"Translation error: {e}")
            return "Translation failed."

# Singleton instances or dependency injection could be used.
# For simplicity, we initialize them here, but PDF_SOURCE_DIR needs to be loaded from env.
def get_pdf_service():
    source_dir = os.getenv("PDF_SOURCE_DIR")
    if not source_dir:
        raise HTTPException(status_code=500, detail="PDF_SOURCE_DIR not configured")
    return PDFService(source_dir)

def get_translation_service():
    return TranslationService()
