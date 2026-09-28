import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import * as L from 'leaflet';

@Component({
  selector: 'sc-location-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sc-map-frame">
      <div #canvas class="sc-map" role="application" [attr.aria-label]="interactive ? 'Mapa para marcar la ubicación' : 'Ubicación registrada'"></div>
      @if (interactive) {
        <button type="button" class="sc-btn" (click)="locate()">Marcar donde estoy</button>
      }
      @if (hint) {
        <p class="sc-price__meta">{{ hint }}</p>
      }
    </div>
  `,
})
export class LocationMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvas') canvas?: ElementRef<HTMLElement>;
  @Input() latitude: number | null = null;
  @Input() longitude: number | null = null;
  @Input() originLatitude: number | null = null;
  @Input() originLongitude: number | null = null;
  @Input() interactive = true;
  @Output() readonly pin = new EventEmitter<{ latitude: number; longitude: number }>();

  hint = '';

  private map?: L.Map;
  private marker?: L.Marker;
  private origin?: L.CircleMarker;
  private resize?: ResizeObserver;

  constructor(
    private readonly zone: NgZone,
    private readonly changes: ChangeDetectorRef,
  ) {}

  ngAfterViewInit(): void {
    const element = this.canvas?.nativeElement;
    if (!element) {
      return;
    }
    this.zone.runOutsideAngular(() => {
      const start = this.view();
      this.map = L.map(element, { zoomControl: true }).setView(start.at, start.zoom);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        noWrap: true,
        attribution: '&copy; OpenStreetMap',
      }).addTo(this.map);
      this.drawOrigin();
      this.drawPin();
      if (this.interactive) {
        this.map.on('click', (event: L.LeafletMouseEvent) => {
          this.zone.run(() => this.pin.emit(roundPin(event.latlng.lat, event.latlng.lng)));
        });
      }
      const fit = () => this.map?.invalidateSize();
      requestAnimationFrame(fit);
      this.resize = new ResizeObserver(() => fit());
      this.resize.observe(element);
    });
  }

  ngOnChanges(): void {
    this.drawOrigin();
    this.drawPin();
  }

  ngOnDestroy(): void {
    this.resize?.disconnect();
    this.map?.remove();
  }

  locate(): void {
    if (!navigator.geolocation) {
      this.hint = 'Este navegador no entrega la ubicación. Marcá el punto en el mapa.';
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.hint = '';
        this.pin.emit(roundPin(position.coords.latitude, position.coords.longitude));
        this.changes.markForCheck();
      },
      () => {
        this.hint = 'No se pudo leer la ubicación. Marcá el punto en el mapa.';
        this.changes.markForCheck();
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  private view(): { at: L.LatLngExpression; zoom: number } {
    if (this.latitude !== null && this.longitude !== null) {
      return { at: [this.latitude, this.longitude], zoom: 15 };
    }
    if (this.originLatitude !== null && this.originLongitude !== null) {
      return { at: [this.originLatitude, this.originLongitude], zoom: 12 };
    }
    return { at: [0, 0], zoom: 2 };
  }

  private drawPin(): void {
    if (!this.map || this.latitude === null || this.longitude === null) {
      this.marker?.remove();
      this.marker = undefined;
      return;
    }
    const at: L.LatLngExpression = [this.latitude, this.longitude];
    if (!this.marker) {
      this.marker = L.marker(at, { icon: pinIcon(), keyboard: this.interactive, title: 'Ubicación marcada' }).addTo(this.map);
    } else {
      this.marker.setLatLng(at);
    }
    this.map.panTo(at);
  }

  private drawOrigin(): void {
    if (!this.map || this.originLatitude === null || this.originLongitude === null) {
      return;
    }
    const at: L.LatLngExpression = [this.originLatitude, this.originLongitude];
    if (!this.origin) {
      this.origin = L.circleMarker(at, {
        radius: 7,
        color: token('--sc-color-theme'),
        weight: 2,
        fillColor: token('--sc-color-surface'),
        fillOpacity: 1,
      })
        .addTo(this.map)
        .bindTooltip('Origen de la instalación', { permanent: false });
    } else {
      this.origin.setLatLng(at);
    }
  }
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function pinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'sc-map-pin',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function roundPin(latitude: number, longitude: number): { latitude: number; longitude: number } {
  return {
    latitude: Math.round(latitude * 1e6) / 1e6,
    longitude: Math.round(longitude * 1e6) / 1e6,
  };
}
