/**
 * i18n - lightweight translations for Aarogya Aggregator.
 * Supports: English (en), Hindi (hi), Tamil (ta), Telugu (te), Bengali (bn), Marathi (mr)
 */
import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Lang = "en" | "hi" | "ta" | "te" | "bn" | "mr" | "gu" | "kn" | "ml" | "pa" | "ur" | "or" | "as";

export const LANGUAGES: { code: Lang; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "ur", label: "Urdu", native: "اردو" },
  { code: "or", label: "Odia", native: "ଓଡ଼ିଆ" },
  { code: "as", label: "Assamese", native: "অসমীয়া" },
];

const VALID_LANGS: Lang[] = ["en", "hi", "ta", "te", "bn", "mr", "gu", "kn", "ml", "pa", "ur", "or", "as"];

const T = {
  app_name: { en: "Aarogya", hi: "आरोग्य", ta: "ஆரோக்கியம்", te: "ఆరోగ్యం", bn: "আরোগ্য", mr: "आरोग्य" },
  tagline: {
    en: "Care, right around the corner",
    hi: "देखभाल, बस आपके पास",
    ta: "பராமரிப்பு, உங்கள் அருகில்",
    te: "మీ దగ్గర సేవలు",
    bn: "যত্ন, একদম কাছে",
    mr: "आरोग्यसेवा, अगदी जवळ",
  },
  login: { en: "Log in", hi: "लॉग इन", ta: "உள்நுழைய", te: "లాగిన్", bn: "লগইন", mr: "लॉग इन" },
  register: { en: "Create account", hi: "खाता बनाएँ", ta: "பதிவு", te: "ఖాతా సృష్టించండి", bn: "অ্যাকাউন্ট তৈরি", mr: "खाते तयार करा" },
  email: { en: "Email", hi: "ईमेल", ta: "மின்னஞ்சல்", te: "ఇమెయిల్", bn: "ইমেইল", mr: "ईमेल" },
  password: { en: "Password", hi: "पासवर्ड", ta: "கடவுச்சொல்", te: "పాస్‌వర్డ్", bn: "পাসওয়ার্ড", mr: "पासवर्ड" },
  name: { en: "Full name", hi: "पूरा नाम", ta: "முழுப் பெயர்", te: "పూర్తి పేరు", bn: "পুরো নাম", mr: "पूर्ण नाव" },
  role: { en: "I am a", hi: "मैं हूँ", ta: "நான்", te: "నేను", bn: "আমি", mr: "मी" },
  patient: { en: "Patient", hi: "मरीज़", ta: "நோயாளி", te: "రోగి", bn: "রোগী", mr: "रुग्ण" },
  clinic_owner: { en: "Clinic / Pharmacy", hi: "क्लिनिक / फार्मेसी", ta: "மருத்துவமனை / மருந்தகம்", te: "క్లినిక్ / ఫార్మసీ", bn: "ক্লিনিক / ফার্মেসি", mr: "क्लिनिक / फार्मसी" },
  admin: { en: "Inspector", hi: "निरीक्षक", ta: "ஆய்வாளர்", te: "ఇన్‌స్పెక్టర్", bn: "পরিদর্শক", mr: "निरीक्षक" },
  near_me: { en: "Near me", hi: "मेरे पास", ta: "என் அருகில்", te: "నా దగ్గర", bn: "আমার কাছে", mr: "माझ्या जवळ" },
  clinics: { en: "Clinics", hi: "क्लिनिक", ta: "மருத்துவமனை", te: "క్లినిక్‌లు", bn: "ক্লিনিক", mr: "क्लिनिक" },
  pharmacies: { en: "Pharmacies", hi: "फार्मेसी", ta: "மருந்தகம்", te: "ఫార్మసీ", bn: "ফার্মেসি", mr: "फार्मसी" },
  all: { en: "All", hi: "सभी", ta: "அனைத்தும்", te: "అన్నీ", bn: "সব", mr: "सर्व" },
  verified: { en: "Verified", hi: "सत्यापित", ta: "சரிபார்க்கப்பட்டது", te: "ధృవీకరించబడింది", bn: "যাচাইকৃত", mr: "सत्यापित" },
  student_friendly: { en: "Student friendly", hi: "छात्र हितैषी", ta: "மாணவர் சலுகை", te: "విద్యార్థి స్నేహపూర్వక", bn: "ছাত্রবান্ধব", mr: "विद्यार्थी अनुकूल" },
  stock_check: { en: "Check stock", hi: "स्टॉक देखें", ta: "சரக்கு சரிபார்க்க", te: "స్టాక్ చూడండి", bn: "স্টক দেখুন", mr: "स्टॉक तपासा" },
  call_to_book: { en: "Call to book", hi: "बुक करने के लिए कॉल", ta: "முன்பதிவு செய்ய அழைக்க", te: "బుక్ చేయడానికి కాల్", bn: "বুক করতে কল", mr: "बुक करण्यासाठी कॉल" },
  inspector_ratings: { en: "Inspector ratings", hi: "निरीक्षक रेटिंग", ta: "ஆய்வாளர் மதிப்பீடு", te: "ఇన్‌స్పెక్టర్ రేటింగ్", bn: "পরিদর্শক রেটিং", mr: "निरीक्षक रेटिंग" },
  user_reviews: { en: "User reviews", hi: "उपयोगकर्ता समीक्षाएँ", ta: "பயனர் மதிப்புரைகள்", te: "వినియోగదారు సమీక్షలు", bn: "ব্যবহারকারী রিভিউ", mr: "वापरकर्त्यांची पुनरावलोकने" },
  cleanliness: { en: "Cleanliness", hi: "स्वच्छता", ta: "சுத்தம்", te: "శుభ్రత", bn: "পরিচ্ছন্নতা", mr: "स्वच्छता" },
  price_transparency: { en: "Price transparency", hi: "मूल्य पारदर्शिता", ta: "விலை வெளிப்படை", te: "ధర పారదర్శకత", bn: "মূল্য স্বচ্ছতা", mr: "किंमत पारदर्शकता" },
  equipment: { en: "Equipment", hi: "उपकरण", ta: "உபகரணம்", te: "పరికరాలు", bn: "যন্ত্রপাতি", mr: "उपकरणे" },
  profile: { en: "Profile", hi: "प्रोफ़ाइल", ta: "சுயவிவரம்", te: "ప్రొఫైల్", bn: "প্রোফাইল", mr: "प्रोफाइल" },
  saved: { en: "Saved", hi: "सहेजे गए", ta: "சேமிக்கப்பட்டது", te: "సేవ్", bn: "সংরক্ষিত", mr: "जतन" },
  home: { en: "Home", hi: "होम", ta: "முகப்பு", te: "హోమ్", bn: "হোম", mr: "मुख्यपृष्ठ" },
  language: { en: "Language", hi: "भाषा", ta: "மொழி", te: "భాష", bn: "ভাষা", mr: "भाषा" },
  logout: { en: "Log out", hi: "लॉग आउट", ta: "வெளியேறு", te: "లాగౌట్", bn: "লগআউট", mr: "लॉग आउट" },
  in_stock: { en: "In stock", hi: "स्टॉक में", ta: "சரக்கில்", te: "స్టాక్‌లో", bn: "স্টকে", mr: "स्टॉकमध्ये" },
  out_of_stock: { en: "Out of stock", hi: "स्टॉक खत्म", ta: "சரக்கு இல்லை", te: "స్టాక్ లేదు", bn: "স্টক নেই", mr: "स्टॉक संपला" },
  send: { en: "Send", hi: "भेजें", ta: "அனுப்பு", te: "పంపండి", bn: "পাঠান", mr: "पाठवा" },
  cancel: { en: "Cancel", hi: "रद्द करें", ta: "ரத்து", te: "రద్దు", bn: "বাতিল", mr: "रद्द" },
  loading: { en: "Loading…", hi: "लोड हो रहा है…", ta: "ஏற்றுகிறது…", te: "లోడ్…", bn: "লোড হচ্ছে…", mr: "लोड…" },
  no_results: { en: "No facilities in this radius. Try widening the search.", hi: "इस दायरे में कोई सुविधा नहीं। दायरा बढ़ाएँ।", ta: "இந்த தூரத்தில் இல்லை. தூரத்தை அதிகரிக்கவும்.", te: "ఈ పరిధిలో లేదు. పరిధిని పెంచండి.", bn: "এই দূরত্বে কিছু নেই। পরিধি বাড়ান।", mr: "या परिघात काही नाही. परिघ वाढवा." },
  away: { en: "away", hi: "दूर", ta: "தூரம்", te: "దూరం", bn: "দূরে", mr: "अंतरावर" },
  dashboard: { en: "Dashboard", hi: "डैशबोर्ड", ta: "டாஷ்போர்டு", te: "డాష్‌బోర్డ్", bn: "ড্যাশবোর্ড", mr: "डॅशबोर्ड" },
  stock_requests: { en: "Stock requests", hi: "स्टॉक अनुरोध", ta: "சரக்கு கோரிக்கைகள்", te: "స్టాక్ అభ్యర్థనలు", bn: "স্টক অনুরোধ", mr: "स्टॉक विनंत्या" },
  pending_inspections: { en: "Pending inspections", hi: "लंबित निरीक्षण", ta: "நிலுவையில் உள்ளவை", te: "పెండింగ్ తనిఖీలు", bn: "মুলতুবি পরিদর্শন", mr: "प्रलंबित निरीक्षणे" },
  verify: { en: "Grant verified badge", hi: "सत्यापित बैज दें", ta: "சரிபார்ப்பு வழங்கு", te: "ధృవీకరణ ఇవ్వండి", bn: "যাচাই দিন", mr: "सत्यापन द्या" },
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: keyof typeof T) => string };
const I18nContext = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (k) => String(k) });

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    AsyncStorage.getItem("lang").then((v) => {
      if (v && VALID_LANGS.includes(v as Lang)) setLangState(v as Lang);
    });
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem("lang", l);
  };
  const t = (k: keyof typeof T) => (T[k] as any)?.[lang] ?? (T[k] as any)?.en ?? String(k);
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);
