#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read the markdown file
const booksMdPath = path.join(__dirname, 'books.md');
const booksHtmlPath = path.join(__dirname, 'books.html');

// Check if fetch is available (Node 18+)
const fetch = globalThis.fetch || require('node-fetch');

async function fetchGoodreadsData(goodreadsUrl) {
  try {
    console.log(`  Fetching data from: ${goodreadsUrl}`);
    const response = await fetch(goodreadsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract title
    const titleMatch = html.match(/<h1[^>]*data-testid="bookTitle"[^>]*>(.*?)<\/h1>/s) ||
                      html.match(/<h1[^>]*class="[^"]*bookTitle[^"]*"[^>]*>(.*?)<\/h1>/s) ||
                      html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    
    // Extract author - try multiple patterns
    let author = '';
    const authorPatterns = [
      /<span[^>]*class="[^"]*authorName[^"]*"[^>]*>(.*?)<\/span>/s,
      /<a[^>]*class="[^"]*authorName[^"]*"[^>]*>(.*?)<\/a>/s,
      /<span[^>]*itemprop="author"[^>]*>[\s\S]*?<span[^>]*itemprop="name"[^>]*>(.*?)<\/span>/s,
      /<a[^>]*itemprop="author"[^>]*>[\s\S]*?<span[^>]*itemprop="name"[^>]*>(.*?)<\/span>/s,
      /<meta\s+name="author"\s+content="([^"]+)"/i,
      /<span[^>]*class="[^"]*ContributorLink[^"]*"[^>]*>(.*?)<\/span>/s,
      /by\s+<a[^>]*>(.*?)<\/a>/i
    ];
    
    for (const pattern of authorPatterns) {
      const match = html.match(pattern);
      if (match) {
        author = match[1].replace(/<[^>]+>/g, '').trim();
        if (author) break;
      }
    }
    
    // Extract image - look for ResponsiveImage class or og:image
    const imageMatch = html.match(/<img[^>]*class="[^"]*ResponsiveImage[^"]*"[^>]*src="([^"]+)"/i) ||
                      html.match(/<img[^>]*id="coverImage"[^>]*src="([^"]+)"/i) ||
                      html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    const image = imageMatch ? imageMatch[1] : '';
    
    return {
      title: title || '',
      author: author || '',
      image: image || ''
    };
  } catch (error) {
    console.warn(`  ⚠ Failed to fetch from Goodreads: ${error.message}`);
    return { title: '', author: '', image: '' };
  }
}

function parseBooksMarkdown(content) {
  const books = [];
  const sections = content.split(/^## /m);
  
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const lines = section.split('\n').filter(line => line.trim());
    
    const book = {
      title: '',
      author: '',
      goodreads: '',
      image: '',
      category: ''
    };
    
    lines.forEach(line => {
      if (line.startsWith('- Title:')) {
        book.title = line.replace('- Title:', '').trim();
      } else if (line.startsWith('- Author:')) {
        book.author = line.replace('- Author:', '').trim();
      } else if (line.startsWith('- Goodreads:')) {
        book.goodreads = line.replace('- Goodreads:', '').trim();
      } else if (line.startsWith('- Image:')) {
        book.image = line.replace('- Image:', '').trim();
      } else if (line.startsWith('- Category:')) {
        book.category = line.replace('- Category:', '').trim().toUpperCase();
      }
    });
    
    books.push(book);
  }
  
  return books;
}

async function enrichBooksFromGoodreads(books) {
  let updated = false;
  const updatedBooks = [];
  
  for (const book of books) {
    // If we have a Goodreads URL but missing title, author, or image, fetch it
    if (book.goodreads && book.goodreads.startsWith('http') && 
        (!book.title || !book.author || !book.image)) {
      const fetched = await fetchGoodreadsData(book.goodreads);
      
      if (fetched.title && !book.title) {
        book.title = fetched.title;
        updated = true;
      }
      if (fetched.author && !book.author) {
        book.author = fetched.author;
        updated = true;
      }
      if (fetched.image && !book.image) {
        book.image = fetched.image;
        updated = true;
      }
    }
    updatedBooks.push(book);
  }
  
  return { books: updatedBooks, updated };
}

function updateBooksMarkdown(books) {
  let content = '# Books\n\n';
  
  books.forEach((book, index) => {
    content += `## Book ${index + 1}\n`;
    content += `- Title: ${book.title || ''}\n`;
    content += `- Author: ${book.author || ''}\n`;
    content += `- Goodreads: ${book.goodreads || ''}\n`;
    content += `- Image: ${book.image || ''}\n`;
    if (book.category) {
      content += `- Category: ${book.category}\n`;
    }
    content += '\n';
  });
  
  fs.writeFileSync(booksMdPath, content, 'utf8');
  console.log('✓ Updated books.md with fetched data');
}

function generateBookCards(books) {
  return books.map((book, index) => {
    const category = book.category || 'FICTION'; // Default to FICTION if not specified
    const categoryText = category === 'NON-FICTION' || category === 'NONFICTION' ? 'NON-FICTION' : 'FICTION';
    
    return `            <!-- Book Card ${index + 1} -->
            <article class="book-card">
              <a href="${book.goodreads || '#'}" target="_blank" rel="noopener" class="book-image-link">
                <img src="${book.image || 'https://via.placeholder.com/300x450?text=Book+Cover'}" alt="${book.title || 'Book'} cover" class="book-image" />
              </a>
              <div class="book-info">
                <span class="book-category">${categoryText}</span>
                <h3 class="book-title">${escapeHtml(book.title || 'Untitled')}</h3>
                <p class="book-author">${escapeHtml(book.author || 'Unknown Author')}</p>
              </div>
            </article>`;
  }).join('\n\n');
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function updateBooksHtml(books) {
  const booksHtml = fs.readFileSync(booksHtmlPath, 'utf8');
  const bookCards = generateBookCards(books);
  
  // Find and replace the books-grid content - match more precisely
  const booksGridRegex = /<div class="books-grid">[\s\S]*?<\/div>\s*<\/section>/;
  const updatedHtml = booksHtml.replace(
    booksGridRegex,
    `<div class="books-grid">\n${bookCards}\n          </div>\n        </section>`
  );
  
  fs.writeFileSync(booksHtmlPath, updatedHtml, 'utf8');
  console.log(`✓ Updated books.html with ${books.length} books`);
}

// Main execution
(async () => {
  try {
    const booksMdContent = fs.readFileSync(booksMdPath, 'utf8');
    let books = parseBooksMarkdown(booksMdContent);
    
    if (books.length === 0) {
      console.warn('⚠ No books found in books.md');
      process.exit(0);
    }
    
    // Enrich books with data from Goodreads if needed
    console.log('📚 Processing books...');
    const { books: enrichedBooks, updated } = await enrichBooksFromGoodreads(books);
    
    // Update markdown if we fetched new data
    if (updated) {
      updateBooksMarkdown(enrichedBooks);
    }
    
    // Update HTML
    updateBooksHtml(enrichedBooks);
  } catch (error) {
    console.error('❌ Error building books:', error.message);
    process.exit(1);
  }
})();
