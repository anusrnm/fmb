import streamlit as st
import matplotlib.pyplot as plt
import pandas as pd
import numpy as np

# Page setup
st.set_page_config(page_title="FMB Generator", layout="wide")
st.markdown("### Field Measurement Book (FMB) Generator")
st.write("Modify the data below. The total area is rendered in the top-right corner of the map sketch.")

# 1. INITIALIZE DEFAULT QUADRILATERAL DATA
default_data = {
    "Point Name": ["Corner A", "Corner B", "Corner C", "Corner D"],
    "Chainage (m)": [0.0, 40.0, 80.0, 100.0],
    "Offset (m)": [0.0, 30.0, -35.0, 0.0]
}
df_initial = pd.DataFrame(default_data)

# 2. INTERACTIVE DATA TABLE
st.subheader("📋 Surveyor's Ladder Data Table")

edited_df = st.data_editor(
    df_initial,
    num_rows="dynamic",
    column_config={
        "Point Name": st.column_config.TextColumn(label="Point Name", default="New Point"),
        "Chainage (m)": st.column_config.NumberColumn(label="Chainage (m)", min_value=0.0, step=0.01, format="%.2f"),
        "Offset (m)": st.column_config.NumberColumn(label="Offset (m) (+Left / -Right)", step=0.01, format="%.2f")
    },
    use_container_width=True
)

# 3. PROCESS THE INTERACTIVE DATA INTO X,Y COORDINATES
points_list = []

for _, row in edited_df.iterrows():
    try:
        x = float(row["Chainage (m)"])
        y = float(row["Offset (m)"])
        name = str(row["Point Name"])
        points_list.append({"x": x, "y": y, "name": name})
    except (ValueError, TypeError):
        continue

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
        
        offset_y_label = 3 if y >= 0 else -5
        ax.text(x, y + offset_y_label, f"{name}\n({x:.2f}, {y:.2f})", 
                fontsize=8, ha='center', va='center')

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
        fontweight='bold',
        color='black',
        bbox=dict(facecolor='lightyellow', alpha=0.9, edgecolor='gray', boxstyle='round,pad=0.5'),
        ha='right', 
        va='top')

# 6. RENDER THE SIMPLIFIED INTERACTIVE SKETCH
st.subheader("🗺️ Live FMB Map")
st.pyplot(fig)
