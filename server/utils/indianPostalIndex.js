// Curated index of major Indian postal codes, localities, and commercial districts
// Enables instant zero-latency autocomplete for queries without consuming API credits

const POSTAL_DIRECTORY = [
  // Delhi NCR
  { name: 'Connaught Place', locality: 'New Delhi', district: 'New Delhi', state: 'Delhi', pincode: '110001' },
  { name: 'Karol Bagh', locality: 'Central Delhi', district: 'Central Delhi', state: 'Delhi', pincode: '110005' },
  { name: 'Chandni Chowk', locality: 'Old Delhi', district: 'North Delhi', state: 'Delhi', pincode: '110006' },
  { name: 'Hauz Khas', locality: 'South Delhi', district: 'South Delhi', state: 'Delhi', pincode: '110016' },
  { name: 'Saket', locality: 'South Delhi', district: 'South Delhi', state: 'Delhi', pincode: '110017' },
  { name: 'Lajpat Nagar', locality: 'South Delhi', district: 'South Delhi', state: 'Delhi', pincode: '110024' },
  { name: 'Dwarka', locality: 'South West Delhi', district: 'South West Delhi', state: 'Delhi', pincode: '110075' },
  { name: 'Rohini', locality: 'North West Delhi', district: 'North West Delhi', state: 'Delhi', pincode: '110085' },
  { name: 'Cyber City', locality: 'Gurugram', district: 'Gurugram', state: 'Haryana', pincode: '122002' },
  { name: 'Sector 62', locality: 'Noida', district: 'Gautam Buddha Nagar', state: 'Uttar Pradesh', pincode: '201309' },

  // Mumbai & Maharashtra
  { name: 'Fort & Colaba', locality: 'South Mumbai', district: 'Mumbai', state: 'Maharashtra', pincode: '400001' },
  { name: 'Nariman Point', locality: 'South Mumbai', district: 'Mumbai', state: 'Maharashtra', pincode: '400021' },
  { name: 'Dadar', locality: 'Central Mumbai', district: 'Mumbai', state: 'Maharashtra', pincode: '400014' },
  { name: 'Bandra West', locality: 'Western Suburbs', district: 'Mumbai Suburban', state: 'Maharashtra', pincode: '400050' },
  { name: 'Bandra Kurla Complex (BKC)', locality: 'Bandra East', district: 'Mumbai Suburban', state: 'Maharashtra', pincode: '400051' },
  { name: 'Andheri West', locality: 'Western Suburbs', district: 'Mumbai Suburban', state: 'Maharashtra', pincode: '400058' },
  { name: 'Andheri East', locality: 'Western Suburbs', district: 'Mumbai Suburban', state: 'Maharashtra', pincode: '400069' },
  { name: 'Powai (Hiranandani)', locality: 'Eastern Suburbs', district: 'Mumbai Suburban', state: 'Maharashtra', pincode: '400076' },
  { name: 'Juhu', locality: 'Western Suburbs', district: 'Mumbai Suburban', state: 'Maharashtra', pincode: '400049' },
  { name: 'Borivali West', locality: 'Western Suburbs', district: 'Mumbai Suburban', state: 'Maharashtra', pincode: '400092' },
  { name: 'Thane West', locality: 'Thane', district: 'Thane', state: 'Maharashtra', pincode: '400601' },
  { name: 'Vashi', locality: 'Navi Mumbai', district: 'Thane', state: 'Maharashtra', pincode: '400703' },
  { name: 'Pune City (Budhwar Peth)', locality: 'Central Pune', district: 'Pune', state: 'Maharashtra', pincode: '411002' },
  { name: 'Shivaji Nagar', locality: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411005' },
  { name: 'Kothrud', locality: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411038' },
  { name: 'Viman Nagar', locality: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411014' },
  { name: 'Hinjawadi IT Park', locality: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411057' },
  { name: 'Baner', locality: 'Pune', district: 'Pune', state: 'Maharashtra', pincode: '411045' },
  { name: 'Nagpur GPO', locality: 'Nagpur', district: 'Nagpur', state: 'Maharashtra', pincode: '440001' },
  { name: 'Nashik City', locality: 'Nashik', district: 'Nashik', state: 'Maharashtra', pincode: '422001' },

  // Bengaluru & Karnataka
  { name: 'MG Road / Brigade Road', locality: 'Central Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560001' },
  { name: 'Malleshwaram', locality: 'North Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560003' },
  { name: 'Basavanagudi', locality: 'South Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560004' },
  { name: 'Jayanagar', locality: 'South Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560011' },
  { name: 'Indiranagar', locality: 'East Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560038' },
  { name: 'Koramangala', locality: 'South East Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560034' },
  { name: 'Whitefield', locality: 'East Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560066' },
  { name: 'Electronic City', locality: 'South Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560100' },
  { name: 'HSR Layout', locality: 'South East Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560102' },
  { name: 'Bellandur (Outer Ring Road)', locality: 'South East Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560103' },
  { name: 'JP Nagar', locality: 'South Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560078' },
  { name: 'Hebbal', locality: 'North Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560024' },
  { name: 'Marathahalli', locality: 'East Bengaluru', district: 'Bengaluru Urban', state: 'Karnataka', pincode: '560037' },
  { name: 'Mysuru (Mysore) City', locality: 'Mysuru', district: 'Mysuru', state: 'Karnataka', pincode: '570001' },
  { name: 'Mangaluru (Mangalore)', locality: 'Hampankatta', district: 'Dakshina Kannada', state: 'Karnataka', pincode: '575001' },
  { name: 'Hubballi (Hubli)', locality: 'Hubballi', district: 'Dharwad', state: 'Karnataka', pincode: '580020' },
  { name: 'Dharwad City', locality: 'Dharwad', district: 'Dharwad', state: 'Karnataka', pincode: '580001' },
  { name: 'Belagavi (Belgaum)', locality: 'Belagavi', district: 'Belagavi', state: 'Karnataka', pincode: '590001' },
  { name: 'Kalaburagi City', locality: 'Gulbarga Head Office', district: 'Kalaburagi', state: 'Karnataka', pincode: '585101' },
  { name: 'Super Market Kalaburagi', locality: 'Kalaburagi', district: 'Kalaburagi', state: 'Karnataka', pincode: '585101' },
  { name: 'MSK Mill Kalaburagi', locality: 'Kalaburagi', district: 'Kalaburagi', state: 'Karnataka', pincode: '585103' },
  { name: 'Sedam', locality: 'Sedam', district: 'Kalaburagi', state: 'Karnataka', pincode: '585222' },
  { name: 'Korwar Tanda', locality: 'Chittapur / Kalgi', district: 'Kalaburagi', state: 'Karnataka', pincode: '585312' },
  { name: 'Aland', locality: 'Aland', district: 'Kalaburagi', state: 'Karnataka', pincode: '585302' },
  { name: 'Chittapur', locality: 'Chittapur', district: 'Kalaburagi', state: 'Karnataka', pincode: '585211' },

  // Hyderabad & Telangana
  { name: 'Abids / Koti', locality: 'Hyderabad', district: 'Hyderabad', state: 'Telangana', pincode: '500001' },
  { name: 'Charminar', locality: 'Old City', district: 'Hyderabad', state: 'Telangana', pincode: '500002' },
  { name: 'Secunderabad', locality: 'Secunderabad', district: 'Hyderabad', state: 'Telangana', pincode: '500003' },
  { name: 'Banjara Hills', locality: 'Central Hyderabad', district: 'Hyderabad', state: 'Telangana', pincode: '500034' },
  { name: 'Jubilee Hills', locality: 'Central Hyderabad', district: 'Hyderabad', state: 'Telangana', pincode: '500033' },
  { name: 'Hitec City / Madhapur', locality: 'Cyberabad', district: 'Rangareddy', state: 'Telangana', pincode: '500081' },
  { name: 'Gachibowli', locality: 'IT Corridor', district: 'Rangareddy', state: 'Telangana', pincode: '500032' },
  { name: 'Kondapur', locality: 'Cyberabad', district: 'Rangareddy', state: 'Telangana', pincode: '500084' },
  { name: 'Kukatpally', locality: 'Kukatpally', district: 'Medchal-Malkajgiri', state: 'Telangana', pincode: '500072' },

  // Chennai & Tamil Nadu
  { name: 'George Town / Parrys', locality: 'North Chennai', district: 'Chennai', state: 'Tamil Nadu', pincode: '600001' },
  { name: 'Mount Road (Anna Salai)', locality: 'Central Chennai', district: 'Chennai', state: 'Tamil Nadu', pincode: '600002' },
  { name: 'Mylapore', locality: 'South Chennai', district: 'Chennai', state: 'Tamil Nadu', pincode: '600004' },
  { name: 'T Nagar', locality: 'Central Chennai', district: 'Chennai', state: 'Tamil Nadu', pincode: '600017' },
  { name: 'Adyar', locality: 'South Chennai', district: 'Chennai', state: 'Tamil Nadu', pincode: '600020' },
  { name: 'Anna Nagar', locality: 'West Chennai', district: 'Chennai', state: 'Tamil Nadu', pincode: '600040' },
  { name: 'Velachery', locality: 'South Chennai', district: 'Chennai', state: 'Tamil Nadu', pincode: '600042' },
  { name: 'OMR (Thoraipakkam)', locality: 'IT Corridor', district: 'Chennai', state: 'Tamil Nadu', pincode: '600096' },
  { name: 'Coimbatore City', locality: 'Coimbatore', district: 'Coimbatore', state: 'Tamil Nadu', pincode: '641001' },
  { name: 'Madurai City', locality: 'Madurai', district: 'Madurai', state: 'Tamil Nadu', pincode: '625001' },

  // Kolkata & Eastern India
  { name: 'BBD Bagh / Dalhousie', locality: 'Central Kolkata', district: 'Kolkata', state: 'West Bengal', pincode: '700001' },
  { name: 'Park Street', locality: 'Central Kolkata', district: 'Kolkata', state: 'West Bengal', pincode: '700016' },
  { name: 'Salt Lake (Sector 5)', locality: 'Salt Lake', district: 'North 24 Parganas', state: 'West Bengal', pincode: '700091' },
  { name: 'New Town', locality: 'Rajarhat', district: 'North 24 Parganas', state: 'West Bengal', pincode: '700156' },
  { name: 'Ballygunge', locality: 'South Kolkata', district: 'Kolkata', state: 'West Bengal', pincode: '700019' },
  { name: 'Howrah Station Area', locality: 'Howrah', district: 'Howrah', state: 'West Bengal', pincode: '711101' },
  { name: 'Bhubaneswar Unit 1', locality: 'Bhubaneswar', district: 'Khurda', state: 'Odisha', pincode: '751001' },
  { name: 'Patna GPO', locality: 'Patna', district: 'Patna', state: 'Bihar', pincode: '800001' },
  { name: 'Ranchi GPO', locality: 'Ranchi', district: 'Ranchi', state: 'Jharkhand', pincode: '834001' },
  { name: 'Guwahati Panbazar', locality: 'Guwahati', district: 'Kamrup Metropolitan', state: 'Assam', pincode: '781001' },

  // Gujarat & Western India
  { name: 'Navrangpura', locality: 'West Ahmedabad', district: 'Ahmedabad', state: 'Gujarat', pincode: '380009' },
  { name: 'Satellite / Vastrapur', locality: 'West Ahmedabad', district: 'Ahmedabad', state: 'Gujarat', pincode: '380015' },
  { name: 'Bodakdev (SG Highway)', locality: 'West Ahmedabad', district: 'Ahmedabad', state: 'Gujarat', pincode: '380054' },
  { name: 'Surat City', locality: 'Surat', district: 'Surat', state: 'Gujarat', pincode: '395003' },
  { name: 'Vadodara (Alkapuri)', locality: 'Vadodara', district: 'Vadodara', state: 'Gujarat', pincode: '390007' },
  { name: 'Rajkot City', locality: 'Rajkot', district: 'Rajkot', state: 'Gujarat', pincode: '360001' },

  // Northern & Central India
  { name: 'Jaipur (C Scheme)', locality: 'Central Jaipur', district: 'Jaipur', state: 'Rajasthan', pincode: '302001' },
  { name: 'Jaipur Pink City', locality: 'Old Jaipur', district: 'Jaipur', state: 'Rajasthan', pincode: '302002' },
  { name: 'Malviya Nagar Jaipur', locality: 'South Jaipur', district: 'Jaipur', state: 'Rajasthan', pincode: '302017' },
  { name: 'Vaishali Nagar Jaipur', locality: 'West Jaipur', district: 'Jaipur', state: 'Rajasthan', pincode: '302021' },
  { name: 'Jodhpur City', locality: 'Jodhpur', district: 'Jodhpur', state: 'Rajasthan', pincode: '342001' },
  { name: 'Udaipur City', locality: 'Udaipur', district: 'Udaipur', state: 'Rajasthan', pincode: '313001' },
  { name: 'Hazratganj Lucknow', locality: 'Central Lucknow', district: 'Lucknow', state: 'Uttar Pradesh', pincode: '226001' },
  { name: 'Gomti Nagar Lucknow', locality: 'East Lucknow', district: 'Lucknow', state: 'Uttar Pradesh', pincode: '226010' },
  { name: 'Varanasi Cantt', locality: 'Varanasi', district: 'Varanasi', state: 'Uttar Pradesh', pincode: '221002' },
  { name: 'Agra Fort Area', locality: 'Agra', district: 'Agra', state: 'Uttar Pradesh', pincode: '282001' },
  { name: 'Kanpur Civil Lines', locality: 'Kanpur', district: 'Kanpur Nagar', state: 'Uttar Pradesh', pincode: '208001' },
  { name: 'Chandigarh Sector 17', locality: 'Chandigarh', district: 'Chandigarh', state: 'Chandigarh', pincode: '160017' },
  { name: 'Chandigarh Sector 35', locality: 'Chandigarh', district: 'Chandigarh', state: 'Chandigarh', pincode: '160035' },
  { name: 'Ludhiana Civil Lines', locality: 'Ludhiana', district: 'Ludhiana', state: 'Punjab', pincode: '141001' },
  { name: 'Amritsar Golden Temple', locality: 'Amritsar', district: 'Amritsar', state: 'Punjab', pincode: '143001' },
  { name: 'Bhopal MP Nagar', locality: 'Bhopal', district: 'Bhopal', state: 'Madhya Pradesh', pincode: '462011' },
  { name: 'Indore Vijay Nagar', locality: 'Indore', district: 'Indore', state: 'Madhya Pradesh', pincode: '452010' },

  // Kerala & Southern India
  { name: 'Thiruvananthapuram GPO', locality: 'Thiruvananthapuram', district: 'Thiruvananthapuram', state: 'Kerala', pincode: '695001' },
  { name: 'Kochi (MG Road)', locality: 'Ernakulam', district: 'Ernakulam', state: 'Kerala', pincode: '682016' },
  { name: 'Kochi (Kakkanad Infopark)', locality: 'Kakkanad', district: 'Ernakulam', state: 'Kerala', pincode: '682030' },
  { name: 'Kozhikode (Calicut)', locality: 'Kozhikode', district: 'Kozhikode', state: 'Kerala', pincode: '673001' },
  { name: 'Visakhapatnam (Vizag)', locality: 'Visakhapatnam', district: 'Visakhapatnam', state: 'Andhra Pradesh', pincode: '530001' },
  { name: 'Vijayawada Governorpet', locality: 'Vijayawada', district: 'NTR', state: 'Andhra Pradesh', pincode: '520002' },
  { name: 'Goa Panaji (Panjim)', locality: 'Panaji', district: 'North Goa', state: 'Goa', pincode: '403001' },
];

function searchPostalDirectory(query, limit = 8) {
  if (!query || typeof query !== 'string') return [];
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const isDigits = /^\d+$/.test(q);

  const matches = [];
  for (const item of POSTAL_DIRECTORY) {
    if (isDigits) {
      if (item.pincode.startsWith(q)) {
        matches.push(item);
      }
    } else {
      const full = `${item.name} ${item.locality} ${item.district} ${item.state}`.toLowerCase();
      if (full.includes(q)) {
        matches.push(item);
      }
    }
    if (matches.length >= limit) break;
  }

  return matches;
}

module.exports = {
  POSTAL_DIRECTORY,
  searchPostalDirectory,
};
