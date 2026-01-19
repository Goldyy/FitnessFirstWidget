#!/usr/bin/env python3
"""
Extract AI Fitness Studios from their website
"""

import json
import re
from pathlib import Path

import requests
from bs4 import BeautifulSoup


def extract_studio_id(url_id):
    """Extract the data-studio-id from a studio page."""
    url = f"https://www.ai-fitness.de/studios/{url_id}"
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        
        # Find the section with class "studio-occupancy-wrapper"
        section = soup.find("section", class_="studio-occupancy-wrapper")
        if section and section.get("data-studio-id"):
            return section["data-studio-id"]
        return None
    except Exception as e:
        print(f"  Error fetching studio ID: {e}")
        return None


def extract_studios():
    """Fetch and extract studio information from ai-fitness.de"""
    
    url = "https://www.ai-fitness.de"
    print(f"Fetching studios from {url}...")
    
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"Error fetching URL: {e}")
        return []
    
    soup = BeautifulSoup(response.text, "html.parser")
    
    # Find all studio links
    studios = []
    for link in soup.find_all("a", href=re.compile(r"^/studios/"), class_="link"):
        url_id = link["href"].replace("/studios/", "")
        name = link.get_text(strip=True)
        
        # Skip header items
        if name and name != "Studios":
            studios.append({
                "url_id": url_id,
                "name": name
            })
    
    # Remove duplicates (keep first occurrence)
    seen = set()
    unique_studios = []
    for studio in studios:
        if studio["url_id"] not in seen:
            seen.add(studio["url_id"])
            unique_studios.append(studio)
    
    # Sort by name
    unique_studios.sort(key=lambda x: x["name"])
    
    # Fetch studio IDs
    total = len(unique_studios)
    for idx, studio in enumerate(unique_studios, 1):
        print(f"[{idx}/{total}] Fetching studio ID for {studio['name']}...")
        studio["studio_id"] = extract_studio_id(studio["url_id"])
    
    return unique_studios


def main():
    """Main function"""
    studios = extract_studios()
    
    if not studios:
        print("No studios found!")
        return
    
    # Save to JSON file
    output_dir = Path(__file__).parent / "assets"
    output_dir.mkdir(exist_ok=True)
    
    output_file = output_dir / "ai-fitness.json"
    
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(studios, f, ensure_ascii=False, indent=2)
    
    print(f"Extracted {len(studios)} studios.")
    print(f"Saved to {output_file}")


if __name__ == "__main__":
    main()
