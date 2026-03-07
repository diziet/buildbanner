FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy the built JS bundle into the static directory.
# Build the client first: cd client && npm run build
# Then copy the output here before building this image:
#   cp ../../client/dist/buildbanner.min.js ./buildbanner.min.js
# Alternatively, mount it at runtime via a volume.
COPY buildbanner.min.js /usr/share/nginx/html/static/buildbanner.min.js

CMD ["/bin/sh", "-c", "/entrypoint.sh && nginx -g 'daemon off;'"]
