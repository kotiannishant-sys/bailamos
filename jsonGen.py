import json
from datetime import datetime, timedelta
from pathlib import Path


def generate_dance_events(id_list):
    id_list = list(dict.fromkeys(id_list)) #remove duplicates
    current_dir = Path(__file__).parent
    lookup_path = current_dir / "lkup.json"
    output_path = current_dir / "output.json"

    if not lookup_path.exists():
        print(f"Error: Could not find 'lookup.json' in {current_dir}")
        return

    with open(lookup_path, "r", encoding="utf-8") as f:
        lookup = json.load(f)

    output_events = []

    for event_id in id_list:
        parts = event_id.split("-")

        # Handle 5 parts: [DATE, START, END, ORG, VENUE]
        if len(parts) == 5:
            date_str, start_time_str, end_time_str, org_key, venue_key = parts
        # Handle 4 parts (fallback): [DATE, START, ORG, VENUE]
        elif len(parts) == 4:
            date_str, start_time_str, org_key, venue_key = parts
            end_time_str = None
        else:
            print(f"Skipping invalid ID format: {event_id}")
            continue

        # Datetime parsing
        try:
            start_dt = datetime.strptime(
                f"{date_str} {start_time_str}", "%Y%m%d %H%M"
            )

            # If end time is provided in the ID
            if end_time_str:
                end_dt = datetime.strptime(
                    f"{date_str} {end_time_str}", "%Y%m%d %H%M"
                )
                # If end time is early morning (e.g., 0100) and start was night (e.g., 2000),
                # it means the event ended the next day. Move the date forward by 1 day.
                if end_dt <= start_dt:
                    end_dt += timedelta(days=1)
            else:
                # Default fallback rule: 01:00 AM next day
                end_dt = (start_dt + timedelta(days=1)).replace(
                    hour=1, minute=0, second=0
                )

        except ValueError:
            print(f"Skipping due to invalid Date/Time format in ID: {event_id}")
            continue

        # Lookups
        venue_info = lookup.get("venues", {}).get(venue_key, {})
        org_info = lookup.get("organizers", {}).get(org_key, {})
        rule_key = f"{org_key} @ {venue_key}"
        rule_info = lookup.get("rules", {}).get(rule_key, {})

        event_type = rule_info.get("type", "💃 Social : Dance")
        title = event_type.replace("💃 Social : ", "") + " Social"

        event_payload = {
            "id": event_id,
            "title": title,
            "summary": "",
            "venue": venue_info.get("venue_name", f"📍 {venue_key}"),
            "venueUrl": venue_info.get("venue_url", ""),
            "type": event_type,
            "cost": rule_info.get("cost", "TBD"),
            "currency": rule_info.get("currency", "₹"),
            "organizers": [
                {
                    "name": org_info.get("full_name", org_key),
                    "url": org_info.get("instagram", ""),
                }
            ],
            "startDateTime": start_dt.isoformat(),
            "endDateTime": end_dt.isoformat(),
            "cancelled": False,
        }

        output_events.append(event_payload)

    final_output = {"events": output_events}

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(final_output, f, indent=4, ensure_ascii=False)

    print(f"Success! Generated data saved to {output_path.name}")


if __name__ == "__main__":
    # Testing both formats (with and without end time)
    input_ids = [
        "20260709-2030-VVDC-GLASSHOUSE_MDD",
        "20260711-2000-APDS-ICONIQA_MIA", 
        "20260713-2100-JUKEBOX-145_BA",
        "20260728-2100-ROCKODEO-145_BA",
    ]
    generate_dance_events(input_ids)

#"20260711-2000-0230-APDS-IconiqaMIA",  # Custom end time (2:30 AM next day)
#"20260711-2000-APDS-IconiqaMIA",  # Fallback rule (1:00 AM next day)
#"20260712-2030-2330-APDS-IconiqaMIA",