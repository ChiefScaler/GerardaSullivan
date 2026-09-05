window.klaroConfig = {
  version: 1,
  elementID: 'klaro',
  storageMethod: 'localStorage',
  cookieName: 'klaro',
  htmlTexts: true,
  privacyPolicy: '/privacy.html',
  default: false,
  mustConsent: false,
  acceptAll: true,
  hideDeclineAll: false,
  translations: {
    en: {
      consentModal: {
        title: 'Cookie preferences',
        description: 'This site uses cookies to ensure it works correctly. You can choose which cookies to allow. See our <a href="/privacy.html">Privacy Policy</a> for details.',
      },
      acceptAll: 'Accept all',
      declineAll: 'Decline optional',
      acceptSelected: 'Save preferences',
      close: 'Close',
      poweredBy: '',
      purposes: {
        functional: 'Essential',
        analytics: 'Analytics',
      },
    },
  },
  services: [
    {
      name: 'necessary',
      title: 'Essential cookies',
      purposes: ['functional'],
      required: true,
      default: true,
      description: 'Required for the website to function and to remember your cookie preferences.'
    },
    {
      name: 'analytics',
      title: 'Analytics',
      purposes: ['analytics'],
      required: false,
      default: false,
      description: 'Google Analytics — helps understand how visitors use the site (pages visited, general location/device). No data is collected until you accept this category.'
    }
  ]
};
