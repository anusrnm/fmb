import streamlit as st
import matplotlib.pyplot as plt
import numpy as np

# Page setup
st.set_page_config(page_title="FMB Generator", layout="wide")
st.markdown("### Field Measurement Book (FMB) Generator")
st.write("Enter your points in a natural coordinate format. Each line can be a point name and x/y pair, such as 'Corner A, 0, 0'.")

# 1. NATURAL POINT INPUT
st.subheader("📍 Point Input")

default_points = """Corner A, 0, 0
Corner B, 40, 30
Corner C, 80, -35
Corner D, 100, 0"""

point_input = st.text_area(
    "Enter points",
    value=default_points,
    help="One point per line. Examples: Corner A, 0, 0 | 10, 20 | Corner A: 0, 0"
)

# 2. PARSE THE TEXT INTO X,Y COORDINATES
points_list = []
parse_warnings = []

for line_no, raw_line in enumerate(point_input.splitlines(), start=1):
    line = raw_line.strip()
    if not line:
        continue

    name = f"Point {line_no}"
    coord_text = line

    if ":" in line:
        name_part, coord_text = line.split(":", 1)
        name = name_part.strip() or name
        coord_text = coord_text.strip()

    coord_text = coord_text.replace("(", "").replace(")", "")
    parts = [part.strip() for part in coord_text.replace(";", ",").split(",") if part.strip()]

    if len(parts) >= 2:
        try:
            if len(parts) >= 3 and not parts[0].replace(".", "", 1).replace("-", "", 1).isdigit():
                name = parts[0]
                x = float(parts[1])
                y = float(parts[2])
            else:
                x = float(parts[0])
                y = float(parts[1])

            points_list.append({"x": x, "y": y, "name": name})
        except ValueError:
            parse_warnings.append(f"Line {line_no}: could not parse '{raw_line}'.")
    else:
        parse_warnings.append(f"Line {line_no}: could not parse '{raw_line}'.")

if parse_warnings:
    st.warning("Some lines were ignored. Use a format like 'Corner A, 0, 0' or '0, 0'.")

st.subheader("📝 Plot Annotation")
center_text = st.text_input("Center text", value="", placeholder="Enter text to show in the middle of the plot")

# 4. SORT, CLOSE POLYGON, AND CALCULATE AREA UNITS
area_sqm = 0.0
hectares = 0
ares = 0
rem_sqm = 0.0

if len(points_list) >= 3:
    left_side = [p for p in points_list if p["y"] >= 0]
    right_side = [p for p in points_list if p["y"] < 0]
    
    left_side.sort(key=lambda p: p["x"])
    right_side.sort(key=lambda p: p["x"], reverse=True)
    
    closed_loop = left_side + right_side
    bx = [p["x"] for p in closed_loop]
    by = [p["y"] for p in closed_loop]
    
    # FIX: Append only the first single coordinate item to properly close the loop path
    bx_draw = bx + [bx[0]]
    by_draw = by + [by[0]]
    
    # Shoelace Formula for Area
    for i in range(len(bx_draw) - 1):
        area_sqm += (bx_draw[i] * by_draw[i+1]) - (bx_draw[i+1] * by_draw[i])
    area_sqm = abs(area_sqm) * 0.5
    
    # Break down area into Hectares, Ares, and Remaining Sqm
    hectares = int(area_sqm // 10000)
    leftover_after_hect = area_sqm % 10000
    ares = int(leftover_after_hect // 100)
    rem_sqm = leftover_after_hect % 100
else:
    bx_draw, by_draw = [], []

# 5. GENERATE THE MATPLOTLIB PLOT
fig, ax = plt.subplots(figsize=(12, 6))

if points_list:
    max_x = max([p["x"] for p in points_list]) if points_list else 100
    # Baseline plot setup
    ax.plot([0, max_x], [0, 0], 'k--', alpha=0.4, label='Baseline')
    
    if len(bx_draw) > 0:
        ax.plot(bx_draw, by_draw, 'g-', linewidth=2.5, label='Property Boundary')
        
        # Side dimension overlays
        for i in range(len(bx_draw) - 1):
            x1, y1 = bx_draw[i], by_draw[i]
            x2, y2 = bx_draw[i+1], by_draw[i+1]
            
            side_length = np.sqrt((x2 - x1)**2 + (y2 - y1)**2)
            mid_x, mid_y = (x1 + x2) / 2, (y1 + y2) / 2
            
            angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
            if angle > 90: angle -= 180
            elif angle < -90: angle += 180
                
            ax.text(mid_x, mid_y, f"{side_length:.2f} m", 
                    color="darkgreen", fontsize=9, fontweight="bold",
                    bbox=dict(facecolor='white', alpha=0.8, edgecolor='none', pad=1),
                    ha='center', va='center', rotation=angle)
    
    # Internal offset lines
    for pt in points_list:
        x, y, name = pt["x"], pt["y"], pt["name"]
        if y != 0:
            ax.plot([x, x], [0, y], 'r:', alpha=0.6)
        ax.scatter(x, y, color='blue', zorder=5)

        # Place the label close to the plotted point with a small offset
        label_x = x + 0.5 if x >= 0 else x - 0.5
        label_y = y + 0.5 if y >= 0 else y - 0.5
        ax.text(
            label_x,
            label_y,
            f"{name}\n({x:.2f}, {y:.2f})",
            fontsize=8,
            ha='left',
            va='bottom',
            bbox=dict(facecolor='white', alpha=0.75, edgecolor='none', pad=0.3),
        )

# Map configuration & axis styling
ax.set_xlabel("Baseline Distance (m)")
ax.set_ylabel("Offset Distance (m)")
ax.grid(True, linestyle=':', alpha=0.4)
ax.axis('equal')
ax.legend(loc="upper left")

# Area Stamp in Top-Right Corner
area_text = f"Area: Hect {hectares} Ares {ares} Sqm {rem_sqm:.2f}"
ax.text(0.97, 0.95, area_text, 
        transform=ax.transAxes, 
        fontsize=9, 
        color='black',
        bbox=dict(facecolor='lightyellow', alpha=0.9, edgecolor='gray', boxstyle='round,pad=0.5'),
        ha='right', 
        va='top')

if center_text.strip():
    ax.text(0.5, 0.5, center_text.strip(), transform=ax.transAxes, ha='center', va='center', fontsize=12, fontweight='bold', color='navy')

# 6. RENDER THE SIMPLIFIED INTERACTIVE SKETCH
st.subheader("🗺️ Live FMB Map")
st.pyplot(fig)
