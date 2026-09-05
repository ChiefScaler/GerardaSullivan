const { DateTime } = (() => {
  // Minimal date helper so we don't need to add luxon as a dependency
  return {
    DateTime: {
      fromJSDate(d) {
        return {
          toFormat() {
            return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
          },
        };
      },
    },
  };
})();

module.exports = function (eleventyConfig) {
  // --- Pages not yet converted into templates: copied through byte-for-byte. ---
  // Nothing about these pages changes in this phase of the CMS build.
  const staticPages = [
    "index.html",
    "about.html",
    "services.html",
    "how-i-work.html",
    "fees.html",
    "contact.html",
    "privacy.html",
    "sign-contract.html",
    "thank-you.html",
  ];
  staticPages.forEach((page) => eleventyConfig.addPassthroughCopy(`src/${page}`));

  // --- Static assets ---
  eleventyConfig.addPassthroughCopy("src/style.css");
  eleventyConfig.addPassthroughCopy("src/main.js");
  eleventyConfig.addPassthroughCopy("src/images");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/favicon.ico");
  eleventyConfig.addPassthroughCopy("src/favicon-16.png");
  eleventyConfig.addPassthroughCopy("src/favicon-32.png");
  eleventyConfig.addPassthroughCopy("src/favicon.svg");
  eleventyConfig.addPassthroughCopy("src/apple-touch-icon.png");
  eleventyConfig.addPassthroughCopy("src/robots.txt");
  eleventyConfig.addPassthroughCopy("src/sitemap.xml");

  // --- Sveltia CMS admin UI, served at /admin/ ---
  eleventyConfig.addPassthroughCopy({ admin: "admin" });

  // --- Blog collection: every markdown file in src/blog/, newest first ---
  eleventyConfig.addCollection("posts", (collectionApi) =>
    collectionApi.getFilteredByGlob("src/blog/*.md").sort((a, b) => b.date - a.date)
  );

  // --- Filters ---
  eleventyConfig.addFilter("readableDate", (dateObj) => DateTime.fromJSDate(dateObj).toFormat());

  eleventyConfig.addFilter("readingTime", (content) => {
    if (!content) return "1 min read";
    const words = String(content).trim().split(/\s+/).length;
    const minutes = Math.max(1, Math.round(words / 200));
    return `${minutes} min read`;
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
    },
    templateFormats: ["njk", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
};
